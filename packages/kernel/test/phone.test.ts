import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  formatPhone,
  isValidPhone,
  normalizePhone,
  PhoneError,
  redactPhone,
} from "../src/phone";

const CANON = "+2348031234567";

describe("Phone kernel (G-I8 fuzz)", () => {
  it("normalizes every accepted shape to E.164", () => {
    for (const input of [
      "+2348031234567",
      "2348031234567",
      "08031234567",
      "8031234567",
      "+234 803 123 4567",
      "0803-123-4567",
      "(0803) 123.4567",
      " 234 8031234567 ",
    ]) {
      expect(normalizePhone(input), input).toBe(CANON);
    }
  });

  it("accepts all Nigerian mobile prefix families", () => {
    for (const p of ["070", "080", "081", "090", "091"]) {
      const local = `${p}12345678`; // 11 digits, 0-prefixed
      expect(normalizePhone(local)).toBe(`+234${local.slice(1)}`);
    }
  });

  it("rejects non-mobile and malformed input", () => {
    for (const bad of [
      "",
      "0803123456", // 10 digits with leading 0 → 9-digit NSN
      "080312345678", // too long
      "01234567890", // Lagos landline prefix
      "06031234567", // invalid family
      "+14155552671", // US number
      "hello",
      "+234803123456a",
    ]) {
      expect(() => normalizePhone(bad), bad).toThrow(PhoneError);
    }
  });

  it("property: normalization is idempotent", () => {
    fc.assert(
      fc.property(validNigerianArb(), (input) => {
        const once = normalizePhone(input);
        return normalizePhone(once) === once;
      }),
    );
  });

  it("property: survives arbitrary spacing/dash/paren/dot noise", () => {
    fc.assert(
      fc.property(
        validNigerianArb(),
        fc.array(fc.constantFrom(" ", "-", ".", "(", ")"), { maxLength: 6 }),
        fc.nat(),
        (input, noise, seed) => {
          let noisy = input;
          for (const [i, ch] of noise.entries()) {
            const pos = (seed + i * 7) % (noisy.length + 1);
            // never inject before the leading '+', which is positionally meaningful
            if (noisy.startsWith("+") && pos === 0) continue;
            noisy = noisy.slice(0, pos) + ch + noisy.slice(pos);
          }
          return normalizePhone(noisy) === normalizePhone(input);
        },
      ),
    );
  });

  it("isValidPhone mirrors normalizePhone", () => {
    expect(isValidPhone("08031234567")).toBe(true);
    expect(isValidPhone("nope")).toBe(false);
  });

  it("formats for ops display", () => {
    expect(formatPhone("08031234567")).toBe("+234 803 123 4567");
  });

  it("redacts for logs — keeps last 4 only", () => {
    expect(redactPhone(CANON)).toBe("+234•••••••4567");
    expect(redactPhone(CANON)).not.toContain("803123");
  });
});

function validNigerianArb(): fc.Arbitrary<string> {
  const nsn = fc
    .tuple(
      fc.constantFrom("70", "80", "81", "90", "91"),
      fc.string({ minLength: 8, maxLength: 8, unit: fc.constantFrom(..."0123456789") }),
    )
    .map(([p, rest]) => `${p}${rest}`);
  return fc
    .tuple(fc.constantFrom("+234", "234", "0", ""), nsn)
    .map(([prefix, n]) => `${prefix}${n}`);
}
