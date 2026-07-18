import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import type {
  CalculatedShippingOptionPrice,
  CalculateShippingOptionPriceContext,
  CalculateShippingOptionPriceDTO,
  CreateFulfillmentResult,
  FulfillmentItemDTO,
  FulfillmentOption,
  FulfillmentOrderDTO,
  Logger,
} from "@medusajs/framework/types";
import { getPool } from "@eshor/kernel";
import { DEFAULT_ZONE_STATE } from "../delivery-zones";

const FULFILLMENT_OPTION_ID = "eshor-flat-rate";

type InjectedDependencies = {
  logger: Logger;
};

type DeliveryZoneRow = {
  fee_kobo: number;
  eta_min_days: number;
  eta_max_days: number;
};

/**
 * P1.4: a Medusa Fulfillment Provider whose sole job is to read the
 * ALREADY-BUILT delivery-zones module's rates (packages/kernel-adjacent
 * module, P1.2) and turn them into a real, calculated shipping-option
 * price -- so the cart's real shipping_total (and therefore Paystack's
 * charge amount, sourced from paymentCollection.amount) actually
 * includes delivery, instead of the fee being cart-page-estimator-only
 * display as it was through P1.2/P1.3.
 *
 * Queries the delivery_zone table directly via @eshor/kernel's shared pg
 * pool, mirroring DeliveryZonesModuleService.quoteFor()'s exact 3-tier
 * fallback (state+area -> state default -> "_default" wildcard) in raw
 * SQL, rather than injecting DeliveryZonesModuleService the normal
 * Medusa way. Found live that this doesn't work here: a provider
 * registered inside a composite module (@medusajs/medusa/fulfillment)
 * gets constructed from that module's OWN scoped provider-loader cradle
 * (confirmed by reading modules-sdk's module-provider-loader.js and the
 * fulfillment module's own providers.js loader), which only has that
 * module's own dependencies plus a few well-known globals like logger --
 * not sibling top-level custom modules. Destructuring `deliveryZones`
 * from the constructor (the textbook AbstractFulfillmentProviderService
 * pattern, which works fine for same-module dependencies) threw
 * "Resolution path: fp_delivery-zones_delivery-zones -> deliveryZones:
 * Could not resolve 'deliveryZones'" -- proven live, not guessed.
 * Reading the same underlying table directly keeps ONE source of DATA
 * truth even though the query code itself is now duplicated once; this
 * is the same DB-pool-reuse pattern @eshor/kernel's own modules
 * (outbox.ts, ledger.ts, stock.ts) already use for eshor_core.
 */
class DeliveryZonesFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "delivery-zones";

  protected logger_: Logger;

  constructor({ logger }: InjectedDependencies) {
    super();
    this.logger_ = logger;
  }

  private async quoteFor(state: string, area?: string): Promise<DeliveryZoneRow | undefined> {
    const pool = getPool();

    if (area) {
      const exact = await pool.query<DeliveryZoneRow>(
        `select fee_kobo, eta_min_days, eta_max_days from delivery_zone
         where state = $1 and area = $2 and active and deleted_at is null`,
        [state, area],
      );
      if (exact.rows[0]) return exact.rows[0];
    }

    const stateDefault = await pool.query<DeliveryZoneRow>(
      `select fee_kobo, eta_min_days, eta_max_days from delivery_zone
       where state = $1 and area is null and active and deleted_at is null`,
      [state],
    );
    if (stateDefault.rows[0]) return stateDefault.rows[0];

    const wildcard = await pool.query<DeliveryZoneRow>(
      `select fee_kobo, eta_min_days, eta_max_days from delivery_zone
       where state = $1 and active and deleted_at is null`,
      [DEFAULT_ZONE_STATE],
    );
    return wildcard.rows[0];
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [{ id: FULFILLMENT_OPTION_ID, name: "Standard delivery" }];
  }

  async canCalculate(): Promise<boolean> {
    return true;
  }

  /**
   * context.shipping_address is the real cart/order address (confirmed
   * against the installed CartPropsForFulfillment type) -- province holds
   * the Nigerian state (checkout's delivery step writes it there before
   * this is ever called, matching NIGERIAN_STATES' exact naming so it
   * lines up with delivery-zones' own `state` column), city holds the
   * free-text "area" when the shopper provides one.
   */
  async calculatePrice(
    _optionData: CalculateShippingOptionPriceDTO["optionData"],
    _data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceContext,
  ): Promise<CalculatedShippingOptionPrice> {
    const state = context.shipping_address?.province;
    if (!state) {
      throw new Error(
        "delivery-zones fulfillment provider requires shipping_address.province (Nigerian state) to calculate a price",
      );
    }

    const quote = await this.quoteFor(state, context.shipping_address?.city ?? undefined);

    if (!quote) {
      throw new Error(`No delivery zone configured for state: ${state}`);
    }

    return {
      // delivery_zone.fee_kobo is genuinely stored in kobo (150000 for
      // NGN1,500); Medusa's calculated_amount wants the plain decimal
      // Naira value, matching its own price-creation API convention --
      // confirmed live 2026-07-18 (see seed-demo.ts's own fix comment
      // for the full story). Divide here, not at the schema/seed level,
      // since this raw-SQL provider is the only consumer that crosses
      // into Medusa's BigNumber pricing system.
      calculated_amount: quote.fee_kobo / 100,
      is_calculated_price_tax_inclusive: true,
    };
  }

  async validateFulfillmentData(
    _optionData: Record<string, unknown>,
    data: Record<string, unknown>,
  ): Promise<any> {
    return data;
  }

  async validateOption(): Promise<boolean> {
    return true;
  }

  async createFulfillment(
    data: Record<string, unknown>,
    _items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    _order: Partial<FulfillmentOrderDTO> | undefined,
  ): Promise<CreateFulfillmentResult> {
    // No external courier API integration yet (P1 scope: flat-rate
    // manual dispatch, matching the ops playbook) -- nothing to call out
    // to. The order's own state machine (P1.1) tracks dispatch/delivery,
    // not this record's data.
    return { data, labels: [] };
  }

  async cancelFulfillment(): Promise<any> {
    return {};
  }

  async getFulfillmentDocuments(): Promise<never[]> {
    return [];
  }

  async getShipmentDocuments(): Promise<never[]> {
    return [];
  }

  async getReturnDocuments(): Promise<never[]> {
    return [];
  }

  async createReturnFulfillment(fulfillment: Record<string, unknown>): Promise<CreateFulfillmentResult> {
    return { data: fulfillment, labels: [] };
  }
}

export default DeliveryZonesFulfillmentProviderService;
