import { getPool, withTransaction } from "./db";

export class StockError extends Error {}

/**
 * The ONLY legal mutation path for stock (hardening §2.2). Atomic
 * conditional decrement — never read-then-write. Returns the remaining
 * quantity on success, or null if there wasn't enough stock (caller
 * decides UX: "just sold out", offer waitlist, etc — EC2.1/EC3.11).
 */
export async function decrementStock(variantId: string, qty: number): Promise<number | null> {
  const res = await getPool().query<{ stock_qty: number }>(
    `UPDATE eshor_core.variants_lite
     SET stock_qty = stock_qty - $2
     WHERE id = $1 AND stock_qty >= $2
     RETURNING stock_qty`,
    [variantId, qty],
  );
  return res.rows[0]?.stock_qty ?? null;
}

export async function incrementStock(variantId: string, qty: number): Promise<void> {
  await getPool().query(
    `UPDATE eshor_core.variants_lite SET stock_qty = stock_qty + $2 WHERE id = $1`,
    [variantId, qty],
  );
}

/**
 * Reservation: decrements stock and records a reservation row in one tx.
 * A sweeper (releaseExpiredReservations) returns stock for anything that
 * expires before conversion to a real order line (EC3.11 — the drop-day
 * race between reservation expiry and a late-arriving payment webhook).
 */
export async function reserveStock(
  variantId: string,
  qty: number,
  ttlSeconds: number,
): Promise<{ reservationId: string } | null> {
  return withTransaction(async (client) => {
    const dec = await client.query<{ stock_qty: number }>(
      `UPDATE eshor_core.variants_lite
       SET stock_qty = stock_qty - $2
       WHERE id = $1 AND stock_qty >= $2
       RETURNING stock_qty`,
      [variantId, qty],
    );
    if (dec.rowCount === 0) return null;

    const ins = await client.query<{ id: string }>(
      `INSERT INTO eshor_core.reservations (variant_id, qty, expires_at)
       VALUES ($1, $2, now() + ($3 || ' seconds')::interval)
       RETURNING id`,
      [variantId, qty, ttlSeconds],
    );
    const reservationId = ins.rows[0]?.id;
    if (reservationId === undefined) throw new StockError("reservation insert returned no id");
    return { reservationId };
  });
}

/** Sweeper: release stock for reservations past their TTL that were never converted. */
export async function releaseExpiredReservations(): Promise<number> {
  return withTransaction(async (client) => {
    const expired = await client.query<{ id: string; variant_id: string; qty: number }>(
      `SELECT id, variant_id, qty FROM eshor_core.reservations
       WHERE released_at IS NULL AND expires_at < now()
       FOR UPDATE SKIP LOCKED`,
    );
    for (const row of expired.rows) {
      await client.query(
        `UPDATE eshor_core.variants_lite SET stock_qty = stock_qty + $2 WHERE id = $1`,
        [row.variant_id, row.qty],
      );
      await client.query(`UPDATE eshor_core.reservations SET released_at = now() WHERE id = $1`, [
        row.id,
      ]);
    }
    return expired.rowCount ?? 0;
  });
}

export async function releaseReservation(reservationId: string): Promise<void> {
  await withTransaction(async (client) => {
    const res = await client.query<{ variant_id: string; qty: number }>(
      `UPDATE eshor_core.reservations
       SET released_at = now()
       WHERE id = $1 AND released_at IS NULL
       RETURNING variant_id, qty`,
      [reservationId],
    );
    const row = res.rows[0];
    if (!row) return; // already released — idempotent
    await client.query(
      `UPDATE eshor_core.variants_lite SET stock_qty = stock_qty + $2 WHERE id = $1`,
      [row.variant_id, row.qty],
    );
  });
}
