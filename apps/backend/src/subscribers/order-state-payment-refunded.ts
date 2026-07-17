import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { IllegalTransitionError, transitionOrder } from "@eshor/kernel";

/** payment.refunded payload is { id } -- the payment id, same resolution as payment.captured. */
export default async function orderStatePaymentRefundedHandler({
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

  try {
    await transitionOrder(order.id, "refunded");
  } catch (err) {
    if (!(err instanceof IllegalTransitionError)) throw err;
  }
}

export const config: SubscriberConfig = {
  event: "payment.refunded",
};
