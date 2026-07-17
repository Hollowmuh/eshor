import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { ensureOrderState } from "@eshor/kernel";

/**
 * P1.1: drives eshor_core.order_state from Medusa's real order lifecycle
 * (confirmed live against the installed @medusajs/utils source, not
 * guessed -- see @medusajs/utils/dist/core-flows/events.js). order.placed
 * fires "when an order is placed, or when a draft order is converted to
 * an order" with payload { id }.
 *
 * ensureOrderState is idempotent by design (ON CONFLICT DO UPDATE ...
 * RETURNING) specifically because this event's own doc comment admits it
 * can double-fire (draft-order conversion is also an order.placed).
 */
export default async function orderStatePlacedHandler({
  event: { data },
}: SubscriberArgs<{ id: string }>): Promise<void> {
  await ensureOrderState(data.id);
}

export const config: SubscriberConfig = {
  event: "order.placed",
};
