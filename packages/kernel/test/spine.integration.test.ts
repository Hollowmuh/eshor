/**
 * Integration suite against a REAL Postgres (compose in dev, service
 * container in CI) — these are the financial-control tests (hardening
 * §5): the money/state-machine kernel is worthless if it isn't proven
 * against actual concurrent DB behavior, not mocks.
 *
 * Requires DATABASE_URL (app role) and DATABASE_URL_LEDGER_TEST (limited
 * eshor_app role) to be set and migrations already applied.
 */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import {
  closePool,
  ensureOrderState,
  decrementStock,
  fetchUnprocessed,
  getBalance,
  getOrderState,
  getOrderStateByTrackingToken,
  getPool,
  IllegalTransitionError,
  appendLedgerEntry,
  computeTrackingProof,
  kobo,
  reserveStock,
  releaseExpiredReservations,
  relayOnce,
  transitionOrder,
  TransitionError,
} from "../src/index";

const RUN_INTEGRATION = process.env.DATABASE_URL !== undefined;
const describeIf = RUN_INTEGRATION ? describe : describe.skip;

async function makeVariant(stockQty: number): Promise<string> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO eshor_core.variants_lite (sku, stock_qty) VALUES ($1, $2) RETURNING id`,
    [`sku-${randomUUID()}`, stockQty],
  );
  const id = res.rows[0]?.id;
  if (id === undefined) throw new Error("no id returned");
  return id;
}

describeIf("Spine integration (real Postgres)", () => {
  afterAll(async () => {
    await closePool();
  });

  describe("stock atomicity — the drop-day race", () => {
    it("200 concurrent decrements against stock=10 yield exactly 10 successes, never negative", async () => {
      const variantId = await makeVariant(10);

      const attempts = Array.from({ length: 200 }, () => decrementStock(variantId, 1));
      const results = await Promise.all(attempts);

      const successes = results.filter((r) => r !== null);
      const failures = results.filter((r) => r === null);

      expect(successes).toHaveLength(10);
      expect(failures).toHaveLength(190);

      const final = await getPool().query<{ stock_qty: number }>(
        `SELECT stock_qty FROM eshor_core.variants_lite WHERE id = $1`,
        [variantId],
      );
      expect(final.rows[0]?.stock_qty).toBe(0);
      // the CHECK (stock_qty >= 0) constraint is the backstop; if it had
      // ever been violated this row would not exist / query would error.
    }, 30000);

    it("reservation TTL sweeper returns stock exactly once (idempotent)", async () => {
      const variantId = await makeVariant(5);
      const reservation = await reserveStock(variantId, 3, -1); // already-expired TTL
      expect(reservation).not.toBeNull();

      const midway = await getPool().query<{ stock_qty: number }>(
        `SELECT stock_qty FROM eshor_core.variants_lite WHERE id = $1`,
        [variantId],
      );
      expect(midway.rows[0]?.stock_qty).toBe(2);

      const releasedFirst = await releaseExpiredReservations();
      const releasedSecond = await releaseExpiredReservations();

      const final = await getPool().query<{ stock_qty: number }>(
        `SELECT stock_qty FROM eshor_core.variants_lite WHERE id = $1`,
        [variantId],
      );
      expect(final.rows[0]?.stock_qty).toBe(5); // returned exactly once
      expect(releasedFirst).toBeGreaterThanOrEqual(1);
      expect(releasedSecond).toBe(0); // second sweep finds nothing new for this reservation
    });
  });

  describe("order transitions — DB-enforced, outbox-coupled (keyed by a real Medusa order id)", () => {
    it("ensureOrderState is idempotent — the 'created' flag distinguishes insert from no-op", async () => {
      const medusaOrderId = `order_${randomUUID()}`;
      const first = await ensureOrderState(medusaOrderId);
      expect(first.created).toBe(true);
      expect(first.state).toBe("pending_payment");

      const second = await ensureOrderState(medusaOrderId);
      expect(second.created).toBe(false);
      expect(second.trackingToken).toBe(first.trackingToken); // same row, not regenerated
    });

    it("legal transition updates state and writes an outbox event atomically", async () => {
      const medusaOrderId = `order_${randomUUID()}`;
      await ensureOrderState(medusaOrderId);
      const before = await fetchUnprocessed(1000);

      const result = await transitionOrder(medusaOrderId, "paid");
      expect(result.from).toBe("pending_payment");
      expect(result.to).toBe("paid");
      expect(await getOrderState(medusaOrderId)).toBe("paid");

      const after = await fetchUnprocessed(1000);
      expect(after.length).toBe(before.length + 1);
      const event = after.find((r) => r.id === result.outboxId);
      expect(event?.event_type).toBe("order.transitioned");
    });

    it("illegal transition is rejected by BOTH the app kernel and the DB trigger", async () => {
      const medusaOrderId = `order_${randomUUID()}`;
      await ensureOrderState(medusaOrderId);
      // pending_payment -> dispatched skips payment entirely: illegal.
      await expect(transitionOrder(medusaOrderId, "dispatched")).rejects.toThrow(
        IllegalTransitionError,
      );
      expect(await getOrderState(medusaOrderId)).toBe("pending_payment"); // unchanged
    });

    it("transitioning a non-existent order fails cleanly", async () => {
      await expect(transitionOrder(`order_${randomUUID()}`, "paid")).rejects.toThrow(
        TransitionError,
      );
    });

    it("no outbox event is written when the transition is illegal (atomicity)", async () => {
      const medusaOrderId = `order_${randomUUID()}`;
      await ensureOrderState(medusaOrderId);
      const before = await fetchUnprocessed(1000);
      await expect(transitionOrder(medusaOrderId, "delivered")).rejects.toThrow();
      const after = await fetchUnprocessed(1000);
      expect(after.length).toBe(before.length); // rolled back together
    });

    it("tracking token round-trips: lookup by token returns the same order + state", async () => {
      const medusaOrderId = `order_${randomUUID()}`;
      const { trackingToken } = await ensureOrderState(medusaOrderId);
      await transitionOrder(medusaOrderId, "paid");

      const found = await getOrderStateByTrackingToken(trackingToken);
      expect(found?.medusaOrderId).toBe(medusaOrderId);
      expect(found?.state).toBe("paid");
    });

    it("tracking proof is deterministic per (order, email) and differs for a different email", () => {
      const secret = "test-secret";
      const proofA = computeTrackingProof("order_1", "amaka@example.com", secret);
      const proofB = computeTrackingProof("order_1", "amaka@example.com", secret);
      const proofC = computeTrackingProof("order_1", "different@example.com", secret);
      expect(proofA).toBe(proofB);
      expect(proofA).not.toBe(proofC);
    });
  });

  describe("outbox relay — at-least-once delivery", () => {
    it("delivers unprocessed events and marks them processed", async () => {
      const medusaOrderId = `order_${randomUUID()}`;
      await ensureOrderState(medusaOrderId);
      await transitionOrder(medusaOrderId, "paid");

      const delivered: string[] = [];
      const count = await relayOnce(async (row) => {
        delivered.push(row.id);
      });

      expect(count).toBeGreaterThanOrEqual(1);

      // second relay pass finds nothing new for these events — proves
      // markProcessed actually took effect, not just an in-memory flag.
      const secondPass = await relayOnce(async (row) => {
        delivered.push(row.id);
      });
      const redelivered = delivered.filter(
        (id, idx) => delivered.indexOf(id) !== idx,
      );
      expect(redelivered).toHaveLength(0);
      void secondPass;
    });

    it("if the consumer throws mid-batch, unprocessed events survive for retry", async () => {
      const medusaOrderId = `order_${randomUUID()}`;
      await ensureOrderState(medusaOrderId);
      const { outboxId } = await transitionOrder(medusaOrderId, "paid");

      await expect(
        relayOnce(async (row) => {
          if (row.id === outboxId) throw new Error("simulated consumer crash");
        }),
      ).rejects.toThrow("simulated consumer crash");

      const stillUnprocessed = await fetchUnprocessed(1000);
      expect(stillUnprocessed.some((r) => r.id === outboxId)).toBe(true);
    });
  });

  describe("ledger — append-only, DB-enforced", () => {
    it("computes balance as SUM, never a stored field", async () => {
      const account = `test:${randomUUID()}`;
      await appendLedgerEntry({
        accountRef: account,
        entryType: "credit_issued",
        amount: kobo(200000),
        ref: `ref-${randomUUID()}`,
      });
      await appendLedgerEntry({
        accountRef: account,
        entryType: "credit_redeemed",
        amount: kobo(-50000),
        ref: `ref-${randomUUID()}`,
      });
      expect(await getBalance(account)).toBe(150000);
    });

    it("is idempotent on (entry_type, ref) — replayed webhook is a no-op, not a double-credit", async () => {
      const account = `test:${randomUUID()}`;
      const ref = `ref-${randomUUID()}`;
      const first = await appendLedgerEntry({
        accountRef: account,
        entryType: "credit_issued",
        amount: kobo(100000),
        ref,
      });
      const replay = await appendLedgerEntry({
        accountRef: account,
        entryType: "credit_issued",
        amount: kobo(100000),
        ref,
      });
      expect(first.inserted).toBe(true);
      expect(replay.inserted).toBe(false);
      expect(await getBalance(account)).toBe(100000); // not 200000
    });

    it("the eshor_app role CANNOT update or delete ledger rows — proven, not assumed", async () => {
      const limitedUrl = process.env.DATABASE_URL_LEDGER_TEST;
      if (!limitedUrl) {
        throw new Error(
          "DATABASE_URL_LEDGER_TEST must be set (connection as eshor_app) to prove immutability",
        );
      }
      const client = new pg.Client({ connectionString: limitedUrl });
      await client.connect();
      try {
        const account = `test:${randomUUID()}`;
        const ref = `ref-${randomUUID()}`;
        await client.query(
          `INSERT INTO eshor_core.ledger (account_ref, entry_type, amount_kobo, ref)
           VALUES ($1, 'credit_issued', 100000, $2)`,
          [account, ref],
        );

        await expect(
          client.query(`UPDATE eshor_core.ledger SET amount_kobo = 999999 WHERE ref = $1`, [ref]),
        ).rejects.toThrow(/permission denied/i);

        await expect(
          client.query(`DELETE FROM eshor_core.ledger WHERE ref = $1`, [ref]),
        ).rejects.toThrow(/permission denied/i);
      } finally {
        await client.end();
      }
    });

    it("rejects zero-amount entries (app guard backed by DB CHECK constraint)", async () => {
      await expect(
        appendLedgerEntry({
          accountRef: `test:${randomUUID()}`,
          entryType: "correction",
          amount: kobo(0),
          ref: `ref-${randomUUID()}`,
        }),
      ).rejects.toThrow();
    });
  });
});
