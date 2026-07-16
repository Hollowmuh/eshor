/**
 * Money kernel — ALL monetary amounts in eshor are kobo integers.
 * ₦1 = 100 kobo. No floats, ever. Formatting happens only at the display edge.
 */

declare const KOBO_BRAND: unique symbol;
export type Kobo = number & { readonly [KOBO_BRAND]: true };

export class MoneyError extends Error {}

/** Construct a Kobo amount from an integer number of kobo. */
export function kobo(value: number): Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`kobo amount must be a safe integer, got ${value}`);
  }
  return value as Kobo;
}

/** Construct from whole naira (e.g. product prices). Rejects fractional naira. */
export function nairaToKobo(naira: number): Kobo {
  if (!Number.isSafeInteger(naira)) {
    throw new MoneyError(`naira amount must be a whole integer, got ${naira}`);
  }
  return kobo(naira * 100);
}

export function add(a: Kobo, b: Kobo): Kobo {
  return kobo(a + b);
}

export function subtract(a: Kobo, b: Kobo): Kobo {
  return kobo(a - b);
}

/** Multiply an amount by an integer quantity (line totals). */
export function times(a: Kobo, qty: number): Kobo {
  if (!Number.isSafeInteger(qty)) {
    throw new MoneyError(`quantity must be a safe integer, got ${qty}`);
  }
  return kobo(a * qty);
}

/**
 * Percentage fees in basis points (1% = 100 bps), integer math,
 * rounded half-up to the nearest kobo — matches PSP behavior.
 */
export function percentBps(a: Kobo, bps: number): Kobo {
  if (!Number.isSafeInteger(bps) || bps < 0) {
    throw new MoneyError(`bps must be a non-negative safe integer, got ${bps}`);
  }
  return kobo(Math.floor((a * bps + 5000) / 10000));
}

export function min(a: Kobo, b: Kobo): Kobo {
  return a <= b ? a : b;
}

export function max(a: Kobo, b: Kobo): Kobo {
  return a >= b ? a : b;
}

export function isNegative(a: Kobo): boolean {
  return a < 0;
}

/**
 * Display formatting. Whole-naira amounts render with no decimals
 * ("₦24,500" — the only style shown on the storefront). Amounts with a
 * kobo remainder (internal fee math) render 2 decimals so nothing is
 * silently truncated.
 */
export function formatNaira(a: Kobo, opts: { symbol?: string } = {}): string {
  const symbol = opts.symbol ?? "₦";
  const sign = a < 0 ? "-" : "";
  const abs = Math.abs(a);
  const whole = Math.floor(abs / 100);
  const rem = abs % 100;
  const grouped = whole.toLocaleString("en-NG");
  return rem === 0
    ? `${sign}${symbol}${grouped}`
    : `${sign}${symbol}${grouped}.${rem.toString().padStart(2, "0")}`;
}

/** SMS-safe formatting (GSM-7 charset — "NGN", not "₦", per G-I7). */
export function formatNairaSms(a: Kobo): string {
  return formatNaira(a, { symbol: "NGN " });
}
