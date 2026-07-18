import { MedusaError } from "@medusajs/framework/utils";
import PaystackProviderService from "../service";

/**
 * Guards the money-conversion boundary between Medusa's own plain-decimal
 * BigNumberInput convention and Paystack's real kobo-subunit API.
 * REVISED 2026-07-18: this test previously asserted the OPPOSITE (no
 * multiplication) based on a "confirmed live" transaction that was
 * actually tested against seed-demo.ts's own *100 seeding bug -- that
 * inflation happened to cancel out the missing multiplication here. Once
 * the seed bug was fixed (see seed-demo.ts's own comment), this
 * cancellation went away and toKobo/fromKobo needed the real conversion
 * restored. These are private methods -- cast to `any` to reach them
 * directly rather than exporting them, since there's no other caller
 * that needs them public.
 */
function buildService(): any {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
  return new PaystackProviderService({ logger }, { secretKey: "sk_test_dummy_key_for_unit_tests" });
}

describe("PaystackProviderService money conversion", () => {
  it("toKobo multiplies a plain-decimal Naira amount by 100", () => {
    const service = buildService();
    expect(service.toKobo(24500)).toBe(2450000);
    expect(service.toKobo("24500")).toBe(2450000);
  });

  it("toKobo DOES multiply by 100 (the regression this test exists to catch)", () => {
    const service = buildService();
    // NGN24,500 item -> Medusa's own internal amount is 24500 (plain
    // decimal), not 2450000. If toKobo ever stops multiplying by 100,
    // this would stay 24500 -- a real 100x undercharge on every live
    // Paystack transaction.
    expect(service.toKobo(24500)).not.toBe(24500);
  });

  it("fromKobo divides a real Paystack kobo amount by 100 back to a plain-decimal BigNumber", () => {
    const service = buildService();
    const result = service.fromKobo(2450000);
    expect(result.numeric).toBe(24500);
  });

  it("toKobo rounds fractional input after multiplying", () => {
    const service = buildService();
    expect(service.toKobo(24500.006)).toBe(2450001);
  });
});

describe("PaystackProviderService.customerEmail", () => {
  it("returns the email when context.customer.email is present", () => {
    const service = buildService();
    const email = service.customerEmail({ context: { customer: { email: "shopper@eshor.dev" } } });
    expect(email).toBe("shopper@eshor.dev");
  });

  it("throws a MedusaError when context.customer.email is missing", () => {
    const service = buildService();
    expect(() => service.customerEmail({ context: {} })).toThrow(MedusaError);
    expect(() => service.customerEmail({ context: { customer: {} } })).toThrow(
      /requires a customer email/,
    );
  });

  it("throws when context itself is missing", () => {
    const service = buildService();
    expect(() => service.customerEmail({})).toThrow(MedusaError);
  });
});
