import { getPool, withTransaction } from "./db";
import { assertLegalTransition, type OrderState } from "./order-states";
import { writeOutboxEvent } from "./outbox";

export class TransitionError extends Error {}

/**
 * DB-backed order transition (hardening §2.1 + §2.3): validates legality
 * against the pure in-process table (fast fail before touching the DB),
 * then performs the UPDATE — which the orders_lite_transition_guard
 * trigger independently re-validates against eshor_core.state_transitions
 * (defense in depth) — and writes the outbox event, all in one tx.
 *
 * `orders_lite` stands in for a real Medusa order aggregate until the
 * order module lands in P1; the transaction shape (state write + outbox
 * write, atomic) is what carries forward unchanged.
 */
export async function transitionOrder(
  orderId: string,
  to: OrderState,
): Promise<{ from: OrderState; to: OrderState; outboxId: string }> {
  return withTransaction(async (client) => {
    const current = await client.query<{ state: OrderState }>(
      `SELECT state FROM eshor_core.orders_lite WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const from = current.rows[0]?.state;
    if (from === undefined) {
      throw new TransitionError(`order not found: ${orderId}`);
    }

    assertLegalTransition(from, to);

    await client.query(`UPDATE eshor_core.orders_lite SET state = $2 WHERE id = $1`, [
      orderId,
      to,
    ]);

    const outboxId = await writeOutboxEvent(client, "order.transitioned", {
      orderId,
      from,
      to,
    });

    return { from, to, outboxId };
  });
}

export async function createOrderLite(initialState: OrderState = "pending_payment"): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO eshor_core.orders_lite (state) VALUES ($1) RETURNING id`,
    [initialState],
  );
  const id = res.rows[0]?.id;
  if (id === undefined) throw new TransitionError("order insert returned no id");
  return id;
}

export async function getOrderState(orderId: string): Promise<OrderState | undefined> {
  const res = await getPool().query<{ state: OrderState }>(
    `SELECT state FROM eshor_core.orders_lite WHERE id = $1`,
    [orderId],
  );
  return res.rows[0]?.state;
}
