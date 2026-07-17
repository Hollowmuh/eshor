import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { DELIVERY_ZONES_MODULE } from "../../../modules/delivery-zones";
import type DeliveryZonesModuleService from "../../../modules/delivery-zones/service";

/**
 * Public store endpoint for the cart/checkout delivery-fee estimator
 * (feature spec E4 AC1, ops playbook flat-rate menu).
 *
 * GET /store/delivery-zones?state=Lagos&area=Ikeja
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const deliveryZonesService: DeliveryZonesModuleService = req.scope.resolve(
    DELIVERY_ZONES_MODULE,
  );

  const state = req.query.state as string | undefined;
  const area = req.query.area as string | undefined;

  if (!state) {
    res.status(400).json({ message: "state query parameter is required" });
    return;
  }

  const quote = await deliveryZonesService.quoteFor({ state, area });
  if (!quote) {
    res.status(404).json({ message: `no delivery zone configured for state: ${state}` });
    return;
  }

  res.json({
    state,
    area: area ?? null,
    fee_kobo: quote.feeKobo,
    eta_min_days: quote.etaMinDays,
    eta_max_days: quote.etaMaxDays,
    courier: quote.courier,
  });
}
