import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { IllegalTransitionError, transitionOrder } from "@eshor/kernel";

/**
 * order.fulfillment_created payload confirmed live: { order_id,
 * fulfillment_id, no_notification } -- order_id is direct, no
 * resolution needed (unlike payment.captured).
 */
export default async function orderStateFulfillmentCreatedHandler({
  event: { data },
}: SubscriberArgs<{ order_id: string; fulfillment_id: string }>): Promise<void> {
  try {
    await transitionOrder(data.order_id, "dispatched");
  } catch (err) {
    // Medusa supports partial/multiple fulfillments per order; our
    // state machine is linear (one "dispatched" transition). A second
    // fulfillment_created for an already-dispatched order is expected,
    // not an error.
    if (!(err instanceof IllegalTransitionError)) throw err;
  }
}

export const config: SubscriberConfig = {
  event: "order.fulfillment_created",
};
