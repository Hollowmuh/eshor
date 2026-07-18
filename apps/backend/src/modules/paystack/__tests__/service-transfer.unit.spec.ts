import PaystackProviderService from "../service";

/**
 * Guards initiatePayment's channel branch (found untested by the
 * 2026-07-19 proof-of-work audit -- only ever exercised by a manual
 * drill script, never in CI). client_ is mocked here rather than
 * fetch -- chargeBankTransfer's own HTTP request shape is covered by
 * client-transfer.unit.spec.ts; this file's job is proving
 * initiatePayment picks the right client method for the configured
 * channel and maps the response correctly, not re-proving the HTTP
 * layer underneath it.
 */
function buildService(channel?: "card" | "bank_transfer") {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() } as any;
  const service = new PaystackProviderService(
    { logger },
    { secretKey: "sk_test_dummy_key_for_unit_tests", channel },
  ) as any;
  const mockClient = {
    chargeBankTransfer: jest.fn(),
    initializeTransaction: jest.fn(),
  };
  service.client_ = mockClient;
  return { service, mockClient };
}

describe("PaystackProviderService.initiatePayment channel branch", () => {
  it("bank_transfer channel calls chargeBankTransfer with toKobo(amount) and a ~30-minute future expiry, mapping the response into InitiatePaymentOutput", async () => {
    const { service, mockClient } = buildService("bank_transfer");
    mockClient.chargeBankTransfer.mockResolvedValue({
      reference: "ref_456",
      status: "pending_bank_transfer",
      account_name: "PAYSTACK CHECKOUT",
      account_number: "9876543210",
      bank: { slug: "test-bank", name: "Test Bank", id: 2 },
      account_expires_at: "2026-07-19T13:00:00.000Z",
      amount: 2450000,
    });

    const result = await service.initiatePayment({
      amount: 24500,
      currency_code: "ngn",
      context: { customer: { email: "shopper@eshor.dev" } },
    });

    expect(mockClient.chargeBankTransfer).toHaveBeenCalledTimes(1);
    const call = mockClient.chargeBankTransfer.mock.calls[0][0];
    // The regression this guards: toKobo not being applied to the
    // transfer path would silently undercharge by 100x, same class of
    // bug as the card path's already-fixed toKobo regression.
    expect(call.amountKobo).toBe(2450000);
    expect(call.email).toBe("shopper@eshor.dev");

    // account_expires_at must be a real future timestamp, not
    // Date.now() (which would 400 live -- Paystack requires it in the
    // future) and not some far-off/hardcoded value.
    const minutesAhead = (call.expiresAt.getTime() - Date.now()) / 60000;
    expect(minutesAhead).toBeGreaterThan(25);
    expect(minutesAhead).toBeLessThanOrEqual(30);

    expect(mockClient.initializeTransaction).not.toHaveBeenCalled();

    expect(result).toEqual({
      id: "ref_456",
      data: {
        reference: "ref_456",
        account_name: "PAYSTACK CHECKOUT",
        account_number: "9876543210",
        bank_name: "Test Bank",
        account_expires_at: "2026-07-19T13:00:00.000Z",
      },
      status: "pending",
    });
  });

  it("card channel (default, channel undefined) calls initializeTransaction, never chargeBankTransfer -- guards the branch condition against ever inverting", async () => {
    const { service, mockClient } = buildService();
    mockClient.initializeTransaction.mockResolvedValue({
      authorization_url: "https://checkout.paystack.com/abc",
      access_code: "access_abc",
    });

    await service.initiatePayment({
      amount: 24500,
      currency_code: "ngn",
      context: { customer: { email: "shopper@eshor.dev" } },
    });

    expect(mockClient.initializeTransaction).toHaveBeenCalledTimes(1);
    expect(mockClient.chargeBankTransfer).not.toHaveBeenCalled();
  });
});
