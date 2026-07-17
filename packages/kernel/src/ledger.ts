import { getPool } from "./db";
import { kobo, type Kobo } from "./money";

export type LedgerEntryType =
  | "credit_issued"
  | "credit_redeemed"
  | "refund"
  | "referral_bonus"
  | "correction";

export class LedgerError extends Error {}

/**
 * Append a ledger entry. Idempotent on (entry_type, ref) — replaying the
 * same webhook/event twice is a no-op, not a double-credit (hardening
 * §2.4). Amount is signed: positive = credit to the account, negative =
 * debit. Never call with amount 0 (DB CHECK rejects it).
 */
export async function appendLedgerEntry(input: {
  accountRef: string;
  entryType: LedgerEntryType;
  amount: Kobo;
  ref: string;
}): Promise<{ inserted: boolean }> {
  if (input.amount === 0) {
    throw new LedgerError("ledger entries must be non-zero");
  }
  const res = await getPool().query(
    `INSERT INTO eshor_core.ledger (account_ref, entry_type, amount_kobo, ref)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (entry_type, ref) DO NOTHING
     RETURNING id`,
    [input.accountRef, input.entryType, input.amount, input.ref],
  );
  return { inserted: res.rowCount === 1 };
}

/** Balance is always computed — never a stored, mutable field. */
export async function getBalance(accountRef: string): Promise<Kobo> {
  const res = await getPool().query<{ sum: string | null }>(
    `SELECT SUM(amount_kobo)::bigint AS sum FROM eshor_core.ledger WHERE account_ref = $1`,
    [accountRef],
  );
  return kobo(Number(res.rows[0]?.sum ?? 0));
}
