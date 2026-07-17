import { createHmac, randomBytes } from "node:crypto";
import { getPool, withTransaction } from "./db";
import { assertLegalTransition, type OrderState } from "./order-states";
import { writeOutboxEvent } from "./outbox";

export class TransitionError extends Error {}

function generateTrackingToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Idempotent: creates the order_state row for a real Medusa order id if
 * it doesn't exist yet (starts at pending_payment), or returns the
 * existing row unchanged. Safe to call from multiple event handlers
 * that might all fire near order creation (e.g. cart.completed AND
 * order.placed) without racing to double-insert.
 */
export async function ensureOrderState(
  medusaOrderId: string,
): Promise<{ state: OrderState; trackingToken: string; created: boolean }> {
  const token = generateTrackingToken();
  const res = await getPool().query<{ state: OrderState; tracking_token: string; xmax: string }>(
    `INSERT INTO eshor_core.order_state (medusa_order_id, state, tracking_token)
     VALUES ($1, 'pending_payment', $2)
     ON CONFLICT (medusa_order_id) DO UPDATE SET medusa_order_id = EXCLUDED.medusa_order_id
     RETURNING state, tracking_token, xmax`,
    [medusaOrderId, token],
  );
  const row = res.rows[0];
  if (!row) throw new TransitionError("order_state upsert returned no row");
  // xmax = 0 on a genuine INSERT, nonzero on the ON CONFLICT UPDATE path
  // (a cheap, standard Postgres trick for "was this row just created").
  return { state: row.state, trackingToken: row.tracking_token, created: row.xmax === "0" };
}

/**
 * DB-backed order transition (hardening §2.1 + §2.3): validates legality
 * against the pure in-process table (fast fail before touching the DB),
 * then performs the UPDATE — which the order_state_transition_guard
 * trigger independently re-validates against eshor_core.state_transitions
 * (defense in depth) — and writes the outbox event, all in one tx.
 *
 * Keyed by the real Medusa order id (P1 — supersedes P0's orders_lite
 * stand-in, which proved this exact transaction shape against real
 * concurrent Postgres before any real order existed to key it by).
 */
export async function transitionOrder(
  medusaOrderId: string,
  to: OrderState,
): Promise<{ from: OrderState; to: OrderState; outboxId: string }> {
  return withTransaction(async (client) => {
    const current = await client.query<{ state: OrderState }>(
      `SELECT state FROM eshor_core.order_state WHERE medusa_order_id = $1 FOR UPDATE`,
      [medusaOrderId],
    );
    const from = current.rows[0]?.state;
    if (from === undefined) {
      throw new TransitionError(`order_state not found for medusa order: ${medusaOrderId}`);
    }

    assertLegalTransition(from, to);

    await client.query(
      `UPDATE eshor_core.order_state SET state = $2 WHERE medusa_order_id = $1`,
      [medusaOrderId, to],
    );

    const outboxId = await writeOutboxEvent(client, "order.transitioned", {
      medusaOrderId,
      from,
      to,
    });

    return { from, to, outboxId };
  });
}

export async function getOrderState(medusaOrderId: string): Promise<OrderState | undefined> {
  const res = await getPool().query<{ state: OrderState }>(
    `SELECT state FROM eshor_core.order_state WHERE medusa_order_id = $1`,
    [medusaOrderId],
  );
  return res.rows[0]?.state;
}

export async function getOrderStateByTrackingToken(
  trackingToken: string,
): Promise<{ medusaOrderId: string; state: OrderState } | undefined> {
  const res = await getPool().query<{ medusa_order_id: string; state: OrderState }>(
    `SELECT medusa_order_id, state FROM eshor_core.order_state WHERE tracking_token = $1`,
    [trackingToken],
  );
  const row = res.rows[0];
  return row ? { medusaOrderId: row.medusa_order_id, state: row.state } : undefined;
}

/**
 * Public tracking-page auth (hardening §1.1, amended for email-primary
 * identity): a URL-safe token that reveals nothing about the order
 * without also knowing the customer's own email. Not the DB-stored
 * tracking_token (which is a lookup key, not a proof of identity) —
 * this is a separate HMAC proof checked at the API boundary.
 */
export function computeTrackingProof(medusaOrderId: string, email: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${medusaOrderId}:${email.toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 32);
}
