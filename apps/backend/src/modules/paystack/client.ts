/**
 * Thin Paystack HTTP client (P1.3). Confirmed live against Paystack's
 * current developer docs (2026-07-17): amounts are in kobo (the
 * subunit), /transaction/initialize + /transaction/verify/:reference
 * for card, /charge for USSD (provider code "737" is the only
 * supported USSD provider currently), webhook signature is HMAC-SHA512
 * over the raw request body using the secret key, header
 * x-paystack-signature.
 */

export class PaystackApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
  }
}

export interface PaystackTransaction {
  reference: string;
  authorization_url?: string;
  access_code?: string;
  status: "success" | "failed" | "abandoned" | "pending" | "ongoing" | "queued" | "reversed";
  amount: number;
  currency: string;
  gateway_response?: string;
  paid_at?: string | null;
  channel?: string;
  metadata?: Record<string, unknown>;
}

export class PaystackClient {
  private readonly baseUrl = "https://api.paystack.co";

  constructor(private readonly secretKey: string) {}

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as { status: boolean; message: string; data: T };
    if (!res.ok || !json.status) {
      throw new PaystackApiError(json.message ?? `Paystack request failed`, res.status, json);
    }
    return json.data;
  }

  /** Card flow: returns an authorization_url the storefront redirects to (or uses Inline JS with the access_code). */
  async initializeTransaction(input: {
    amountKobo: number;
    email: string;
    currencyCode: string;
    reference?: string;
    metadata?: Record<string, unknown>;
  }): Promise<PaystackTransaction> {
    return this.request<PaystackTransaction>("POST", "/transaction/initialize", {
      amount: input.amountKobo,
      email: input.email,
      currency: input.currencyCode,
      reference: input.reference,
      metadata: input.metadata,
    });
  }

  async verifyTransaction(reference: string): Promise<PaystackTransaction> {
    return this.request<PaystackTransaction>("GET", `/transaction/verify/${encodeURIComponent(reference)}`);
  }

  /** USSD charge (Charge API) -- provider code 737 is the only supported USSD type per Paystack docs. */
  async chargeUssd(input: {
    amountKobo: number;
    email: string;
    ussdType?: string;
  }): Promise<PaystackTransaction & { reference: string }> {
    return this.request("POST", "/charge", {
      amount: input.amountKobo,
      email: input.email,
      ussd: { type: input.ussdType ?? "737" },
    });
  }

  async refund(input: { transactionReference: string; amountKobo?: number }): Promise<unknown> {
    return this.request("POST", "/refund", {
      transaction: input.transactionReference,
      amount: input.amountKobo,
    });
  }
}
