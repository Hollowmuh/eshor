import { MedusaService } from "@medusajs/framework/utils";
import DeliveryZone from "./models/delivery-zone";

/** Wildcard state row: the ops playbook's "other states" ₦3,000/3-5d tier. */
export const DEFAULT_ZONE_STATE = "_default";

class DeliveryZonesModuleService extends MedusaService({
  DeliveryZone,
}) {
  /**
   * Best-match lookup for the cart/checkout estimator, in order:
   * 1. exact state+area match
   * 2. the state's own default row (area: null)
   * 3. the wildcard "_default" row (ops playbook's "other states" tier)
   * Returns null only if even the wildcard row is missing (misconfigured
   * deployment, not a normal "unknown state" case).
   */
  async quoteFor(input: { state: string; area?: string }): Promise<{
    feeKobo: number;
    etaMinDays: number;
    etaMaxDays: number;
    courier: string;
  } | null> {
    const toResult = (z: {
      fee_kobo: number;
      eta_min_days: number;
      eta_max_days: number;
      courier: string;
    }) => ({
      feeKobo: z.fee_kobo,
      etaMinDays: z.eta_min_days,
      etaMaxDays: z.eta_max_days,
      courier: z.courier,
    });

    if (input.area) {
      const [exact] = await this.listDeliveryZones({
        state: input.state,
        area: input.area,
        active: true,
      });
      if (exact) return toResult(exact);
    }

    const [stateDefault] = await this.listDeliveryZones({
      state: input.state,
      area: null,
      active: true,
    });
    if (stateDefault) return toResult(stateDefault);

    const [wildcard] = await this.listDeliveryZones({
      state: DEFAULT_ZONE_STATE,
      active: true,
    });
    return wildcard ? toResult(wildcard) : null;
  }
}

export default DeliveryZonesModuleService;
