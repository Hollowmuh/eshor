import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  add,
  formatNaira,
  formatNairaSms,
  kobo,
  MoneyError,
  nairaToKobo,
  percentBps,
  subtract,
  times,
} from "../src/money";

const arbKobo = fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }).map(kobo);

describe("Money kernel", () => {
  it("rejects non-integer kobo", () => {
    expect(() => kobo(1.5)).toThrow(MoneyError);
    expect(() => kobo(Number.NaN)).toThrow(MoneyError);
    expect(() => kobo(Number.MAX_SAFE_INTEGER + 1)).toThrow(MoneyError);
  });

  it("rejects fractional naira at construction", () => {
    expect(() => nairaToKobo(24500.5)).toThrow(MoneyError);
    expect(nairaToKobo(24500)).toBe(2450000);
  });

  it("addition is commutative and associative (property)", () => {
    fc.assert(
      fc.property(arbKobo, arbKobo, (a, b) => add(a, b) === add(b, a)),
    );
    fc.assert(
      fc.property(arbKobo, arbKobo, arbKobo, (a, b, c) =>
        add(add(a, b), c) === add(a, add(b, c)),
      ),
    );
  });

  it("subtract inverts add (property)", () => {
    fc.assert(
      fc.property(arbKobo, arbKobo, (a, b) => subtract(add(a, b), b) === a),
    );
  });

  it("times is repeated addition (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }).map(kobo),
        fc.integer({ min: 0, max: 50 }),
        (a, n) => {
          let sum = kobo(0);
          for (let i = 0; i < n; i++) sum = add(sum, a);
          return times(a, n) === sum;
        },
      ),
    );
  });

  it("percentBps: Paystack card fee example (1.5% of ₦25,000 = ₦375)", () => {
    expect(percentBps(nairaToKobo(25000), 150)).toBe(nairaToKobo(375));
  });

  it("percentBps never loses precision to floats (property: result is integer)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000_000 }).map(kobo),
        fc.integer({ min: 0, max: 10_000 }),
        (a, bps) => Number.isSafeInteger(percentBps(a, bps)),
      ),
    );
  });

  it("formats whole naira with no decimals — the storefront style", () => {
    expect(formatNaira(nairaToKobo(24500))).toBe("₦24,500");
    expect(formatNaira(kobo(0))).toBe("₦0");
    expect(formatNaira(nairaToKobo(1_250_000))).toBe("₦1,250,000");
  });

  it("shows kobo remainder rather than silently truncating", () => {
    expect(formatNaira(kobo(2450050))).toBe("₦24,500.50");
    expect(formatNaira(kobo(-9950))).toBe("-₦99.50");
  });

  it("SMS format avoids the ₦ glyph (GSM-7)", () => {
    expect(formatNairaSms(nairaToKobo(24500))).toBe("NGN 24,500");
    expect(formatNairaSms(nairaToKobo(24500))).not.toContain("₦");
  });
});
