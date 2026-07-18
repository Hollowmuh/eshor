import { PaystackApiError, PaystackClient } from "../client";

/**
 * Guards chargeBankTransfer's real gotcha (found live 2026-07-18, see
 * client.ts's own comment): account_expires_at is REQUIRED by Paystack's
 * /charge endpoint, not optional as the docs summary implied -- omitting
 * it 400s with "date field is required". Never proven before this audit;
 * only ever exercised by a manual drill script, never in CI.
 */
function mockFetchOnce(status: number, json: unknown) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  });
  (global as any).fetch = fetchMock;
  return fetchMock;
}

describe("PaystackClient.chargeBankTransfer", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("POSTs /charge with amount in kobo, email, and the required bank_transfer.account_expires_at", async () => {
    const fetchMock = mockFetchOnce(200, {
      status: true,
      message: "ok",
      data: {
        reference: "ref_123",
        status: "pending_bank_transfer",
        account_name: "PAYSTACK CHECKOUT",
        account_number: "1234567890",
        bank: { slug: "test-bank", name: "Test Bank", id: 1 },
        account_expires_at: "2026-07-19T12:00:00.000Z",
        amount: 2450000,
      },
    });

    const client = new PaystackClient("sk_test_dummy_key_for_unit_tests");
    const expiresAt = new Date("2026-07-19T12:00:00.000Z");

    const result = await client.chargeBankTransfer({
      amountKobo: 2450000,
      email: "shopper@eshor.dev",
      expiresAt,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.paystack.co/charge");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_test_dummy_key_for_unit_tests");

    const body = JSON.parse(init.body);
    expect(body.amount).toBe(2450000);
    expect(body.email).toBe("shopper@eshor.dev");
    // The regression this test exists to catch: account_expires_at
    // silently dropped (or sent under the wrong key) would 400 live but
    // pass any test that doesn't actually inspect the request body.
    expect(body.bank_transfer).toEqual({ account_expires_at: "2026-07-19T12:00:00.000Z" });

    expect(result.reference).toBe("ref_123");
    expect(result.account_number).toBe("1234567890");
    expect(result.bank.name).toBe("Test Bank");
  });

  it("throws PaystackApiError when Paystack rejects the charge (e.g. a real 400 for a missing required field)", async () => {
    mockFetchOnce(400, { status: false, message: "date field is required", data: null });

    const client = new PaystackClient("sk_test_dummy_key_for_unit_tests");

    await expect(
      client.chargeBankTransfer({
        amountKobo: 2450000,
        email: "shopper@eshor.dev",
        expiresAt: new Date(),
      }),
    ).rejects.toThrow(PaystackApiError);
  });
});
