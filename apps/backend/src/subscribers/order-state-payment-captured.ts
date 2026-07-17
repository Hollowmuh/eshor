import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { ensureOrderState, IllegalTransitionError, transitionOrder } from "@eshor/kernel";

/**
 * payment.captured payload is { id } -- the PAYMENT id, not the order id
 * (confirmed live against @medusajs/utils/dist/core-flows/events.js and
 * the admin payment query-config, which showed payment.payment_collection_id
 * as a direct field and order.payment_collections as a real relation).
 * Resolves payment -> payment_collection_id -> order before transitioning.
 */
export default async function orderStatePaymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>): Promise<void> {
  const paymentModuleService = container.resolve(Modules.PAYMENT);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);

  const payment = await paymentModuleService.retrievePayment(data.id);
  if (!payment.payment_collection_id) return;

  const { data: orders } = await query.graph({
    entity: "order",
    filters: { payment_collections: { id: payment.payment_collection_id } },
    fields: ["id"],
  });
  const order = orders[0];
  if (!order) return;

  // ensureOrderState is idempotent -- if order.placed hasn't fired yet
  // for some reason (event-ordering race), this still leaves a row to
  // transition rather than failing on "order_state not found".
  await ensureOrderState(order.id);
  try {
    await transitionOrder(order.id, "paid");
  } catch (err) {
    // A second payment.captured for the same order (rare, but Medusa
    // allows multiple payments per collection) hits an already-paid
    // order -- pending_payment -> paid twice is illegal by design
    // (EC3.6: double-charge protection). Benign no-op, not a bug.
    if (!(err instanceof IllegalTransitionError)) throw err;
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
};
