import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import { getOrderStateByTrackingToken } from "@eshor/kernel";

/**
 * Public order tracking (P1.5). Uses the raw stored trackingToken
 * (kernel's ensureOrderState/getOrderStateByTrackingToken) as a
 * standalone bearer-capability token -- NOT computeTrackingProof (a
 * separate, unused HMAC primitive in the same kernel file). 128 random
 * bits is already a complete, secure capability URL on its own (same
 * pattern as e.g. Stripe's hosted invoice links); combining both would
 * be redundant, not more secure.
 *
 * Minimal projection only (first name + city, no full address/phone) --
 * feature-spec EC4.4.
 *
 * GET /store/orders/track/:token
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const token = req.params.token;

  const result = await getOrderStateByTrackingToken(token);
  if (!result) {
    res.status(404).json({ message: "No order found for this tracking link" });
    return;
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: orders } = await query.graph({
    entity: "order",
    filters: { id: result.medusaOrderId },
    fields: ["display_id", "shipping_address.first_name", "shipping_address.city"],
  });
  const order = orders[0];

  res.json({
    state: result.state,
    display_id: order?.display_id ?? null,
    first_name: order?.shipping_address?.first_name ?? null,
    city: order?.shipping_address?.city ?? null,
  });
}
