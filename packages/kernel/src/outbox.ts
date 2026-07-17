import type pg from "pg";
import { getPool } from "./db";

export interface OutboxRow {
  id: string;
  event_type: string;
  payload: unknown;
  created_at: Date;
  processed_at: Date | null;
}

/**
 * Write an outbox event inside an existing transaction — the caller (e.g.
 * transitionOrder) is responsible for including this in the same tx as the
 * state change it originates from (hardening §2.3: atomic write, no event
 * is ever lost even if the relay/Redis is down).
 */
export async function writeOutboxEvent(
  client: pg.ClientBase,
  eventType: string,
  payload: unknown,
): Promise<string> {
  const res = await client.query<{ id: string }>(
    `INSERT INTO eshor_core.outbox (event_type, payload) VALUES ($1, $2) RETURNING id`,
    [eventType, JSON.stringify(payload)],
  );
  const id = res.rows[0]?.id;
  if (id === undefined) throw new Error("outbox insert returned no id");
  return id;
}

export async function fetchUnprocessed(limit = 100): Promise<OutboxRow[]> {
  const res = await getPool().query<OutboxRow>(
    `SELECT id, event_type, payload, created_at, processed_at
     FROM eshor_core.outbox
     WHERE processed_at IS NULL
     ORDER BY id ASC
     LIMIT $1`,
    [limit],
  );
  return res.rows;
}

export async function markProcessed(id: string): Promise<void> {
  await getPool().query(`UPDATE eshor_core.outbox SET processed_at = now() WHERE id = $1`, [id]);
}

export type OutboxConsumer = (row: OutboxRow) => Promise<void>;

/**
 * Relay: poll unprocessed rows, deliver at-least-once. If the process dies
 * mid-batch, unprocessed rows are simply picked up again next run — the
 * consumer MUST be idempotent (dedupe on outbox id at the sink).
 */
export async function relayOnce(consume: OutboxConsumer, limit = 100): Promise<number> {
  const rows = await fetchUnprocessed(limit);
  let delivered = 0;
  for (const row of rows) {
    await consume(row);
    await markProcessed(row.id);
    delivered++;
  }
  return delivered;
}
