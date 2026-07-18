import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ensureOrderState } from "@eshor/kernel";

/**
 * Lets the storefront's order-confirmation page (a separate process/env
 * from the backend, no direct DB access) fetch its own order's tracking
 * token. ensureOrderState is idempotent -- safe to call again even if
 * order.placed's subscriber already created the row; returns the
 * existing one unchanged rather than erroring.
 *
 * GET /store/orders/:id/tracking-token
 */
export async function GET(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const orderId = req.params.id;

  const { trackingToken } = await ensureOrderState(orderId);

  res.json({ tracking_token: trackingToken });
}
