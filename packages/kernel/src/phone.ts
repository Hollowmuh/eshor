/**
 * Phone kernel — the identity spine. Every Nigerian phone number in the
 * system is stored as E.164 (+234XXXXXXXXXX). This is the ONLY module
 * allowed to parse or normalize phone input (G-I8): every ingress —
 * checkout, admin manual entry, WhatsApp webhooks (wa_id arrives without
 * "+"), CSV imports — must pass through normalizePhone.
 */

export class PhoneError extends Error {}

/**
 * Nigerian mobile national-significant-number prefixes (first two digits
 * of the 10-digit subscriber number): 070x→70, 080x→80, 081x→81,
 * 090x→90, 091x→91.
 */
const NG_MOBILE_PREFIXES = ["70", "80", "81", "90", "91"] as const;

const STRIP_RE = /[\s\-().]/g;

/**
 * Normalize any user-supplied Nigerian mobile number to E.164.
 * Accepted shapes (after stripping spaces/dashes/parens/dots):
 *   +2348031234567 | 2348031234567 | 08031234567 | 8031234567
 * Returns the canonical "+234XXXXXXXXXX" or throws PhoneError.
 */
export function normalizePhone(input: string): string {
  const stripped = input.replace(STRIP_RE, "");
  if (stripped.length === 0) throw new PhoneError("empty phone number");

  let rest: string;
  if (stripped.startsWith("+234")) {
    rest = stripped.slice(4);
  } else if (stripped.startsWith("234")) {
    rest = stripped.slice(3);
  } else if (stripped.startsWith("0")) {
    rest = stripped.slice(1);
  } else {
    rest = stripped;
  }

  if (!/^\d{10}$/.test(rest)) {
    throw new PhoneError(`not a valid Nigerian mobile number: ${input}`);
  }
  const prefix = rest.slice(0, 2) as (typeof NG_MOBILE_PREFIXES)[number];
  if (!NG_MOBILE_PREFIXES.includes(prefix)) {
    throw new PhoneError(`unrecognized Nigerian mobile prefix: ${input}`);
  }
  return `+234${rest}`;
}

export function isValidPhone(input: string): boolean {
  try {
    normalizePhone(input);
    return true;
  } catch {
    return false;
  }
}

/** Display form for ops UIs: +234 803 123 4567 */
export function formatPhone(e164: string): string {
  const n = normalizePhone(e164);
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7, 10)} ${n.slice(10)}`;
}

/** PII-scrubbed form for logs (hardening §4.1): +234•••••••4567 */
export function redactPhone(e164: string): string {
  const n = normalizePhone(e164);
  return `${n.slice(0, 4)}•••••••${n.slice(-4)}`;
}
