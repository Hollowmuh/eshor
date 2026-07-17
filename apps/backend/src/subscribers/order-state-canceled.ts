import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { IllegalTransitionError, transitionOrder } from "@eshor/kernel";

/** order.canceled payload confirmed live: { id } -- the order id directly. */
export default async function orderStateCanceledHandler({
  event: { data },
}: SubscriberArgs<{ id: string }>): Promise<void> {
  try {
    await transitionOrder(data.id, "cancelled");
  } catch (err) {
    if (!(err instanceof IllegalTransitionError)) throw err;
  }
}

export const config: SubscriberConfig = {
  event: "order.canceled",
};
