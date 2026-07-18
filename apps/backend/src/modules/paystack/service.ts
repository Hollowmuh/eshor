import { createHmac, randomUUID } from "node:crypto";
import { AbstractPaymentProvider, BigNumber, MedusaError } from "@medusajs/framework/utils";
import type {
  AuthorizePaymentInput,
  AuthorizePaymentOutput,
  CancelPaymentInput,
  CancelPaymentOutput,
  CapturePaymentInput,
  CapturePaymentOutput,
  DeletePaymentInput,
  DeletePaymentOutput,
  GetPaymentStatusInput,
  GetPaymentStatusOutput,
  InitiatePaymentInput,
  InitiatePaymentOutput,
  Logger,
  ProviderWebhookPayload,
  RefundPaymentInput,
  RefundPaymentOutput,
  RetrievePaymentInput,
  RetrievePaymentOutput,
  UpdatePaymentInput,
  UpdatePaymentOutput,
  WebhookActionResult,
} from "@medusajs/framework/types";
import { PaystackApiError, PaystackClient, type PaystackTransaction } from "./client";

export interface PaystackOptions {
  secretKey: string;
  /**
   * Which Charge API channel this provider instance uses for
   * initiatePayment. Card is the default (Inline/redirect via
   * /transaction/initialize); "bank_transfer" registers a second
   * instance of this same class under a distinct provider id (see
   * medusa-config.ts) so the storefront can offer both as separate
   * checkout options (G-P8: card and Charge-API channels are different
   * integration surfaces wrapped behind one interface here).
   */
  channel?: "card" | "bank_transfer";
}

type InjectedDependencies = {
  logger: Logger;
};

/**
 * P1.3 Paystack payment provider (Medusa's AbstractPaymentProvider
 * interface, confirmed against the installed 2.17.2 package source --
 * not guessed). Card (Inline/redirect) + Pay with Transfer, both via
 * this one class (see `channel` option) + webhook-verified capture.
 * USSD is coded in the client but not registered as a checkout option
 * yet. Dedicated Virtual Accounts stay P3 scope (needs a CAC-registered
 * business, gotcha G-P3) -- Pay with Transfer here uses a temporary
 * per-transaction account instead, which needs no business registration.
 *
 * Card flow live-verified 2026-07-17. Bank-transfer charge response
 * shape confirmed live 2026-07-18 against the real test-mode sandbox
 * (see client.ts's PaystackBankTransferCharge comment).
 */
class PaystackProviderService extends AbstractPaymentProvider<PaystackOptions> {
  static identifier = "paystack";

  protected readonly logger_: Logger;
  protected readonly options_: PaystackOptions;
  protected readonly client_: PaystackClient;

  static validateOptions(options: Record<string, unknown>): void {
    if (!options.secretKey || typeof options.secretKey !== "string") {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Paystack provider requires a secretKey option (PAYSTACK_SECRET_KEY)",
      );
    }
    // Gotcha G-P3/boot-guard principle: refuse a key/env mismatch at
    // startup rather than discover it mid-checkout. Live keys in
    // non-production, or test keys in production, are both incidents.
    const key = options.secretKey;
    const isLive = key.startsWith("sk_live_");
    const isTest = key.startsWith("sk_test_");
    if (!isLive && !isTest) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `PAYSTACK_SECRET_KEY has an unrecognized prefix (expected sk_live_ or sk_test_)`,
      );
    }
  }

  constructor(cradle: InjectedDependencies, options: PaystackOptions) {
    super(cradle, options);
    this.logger_ = cradle.logger;
    this.options_ = options;
    this.client_ = new PaystackClient(options.secretKey);
  }

  /**
   * CORRECTED 2026-07-18: the 2026-07-17 "confirmed live" note above was
   * wrong -- it was tested against seed-demo.ts's OWN bug
   * (`priceNaira * 100`), which pre-inflated every price by 100x. That
   * inflation exactly canceled out a missing multiplication here, so the
   * real Paystack test charge happened to land on the correct amount
   * for the wrong reason. Once seed-demo.ts was fixed to seed the plain
   * decimal amount (24500 for NGN24,500, confirmed live by creating a
   * test product and observing it render correctly), Medusa's
   * BigNumberInput here arrives as that same plain decimal -- so this
   * function must now do the real Naira-to-kobo conversion Paystack's
   * API actually requires (amounts in kobo, the subunit). Skipping the
   * multiplication again would silently undercharge every real
   * transaction by 100x.
   */
  private toKobo(amount: unknown): number {
    return Math.round(Number(amount) * 100);
  }

  /** Inverse of toKobo -- converts a real Paystack kobo amount (from a webhook payload) back to Medusa's plain-decimal BigNumberInput. */
  private fromKobo(amountKobo: number): BigNumber {
    return new BigNumber(amountKobo / 100);
  }

  /**
   * CONFIRMED live 2026-07-17 (earlier comment here blamed raw
   * createCartWorkflow vs the real store API -- disproven; the real
   * cause was one level up). context.customer.email only arrives
   * populated if the caller is authenticated: Medusa's
   * createPaymentSessionsWorkflow builds `context.customer` from a
   * `customer_id` in its own workflow input, and the store API's
   * POST /store/payment-collections/:id/payment-sessions route sources
   * that customer_id *only* from `req.auth_context?.actor_id` -- never
   * from the cart's own linked customer_id, even when the cart already
   * has a real guest Customer record. Proved this by reading the
   * installed source directly (core-flows'
   * create-payment-session.js workflow and medusa's store
   * payment-sessions route.js), then confirming live: the identical
   * request against a cart with a confirmed linked customer failed
   * with this exact error when unauthenticated, and succeeded once a
   * silent guest emailpass login (random password) put a JWT on the
   * request. So this method itself needs no workaround -- the fix
   * lives in the checkout flow, which must silently authenticate the
   * guest before calling payment-sessions (see p1-3-paystack-live-drill.ts).
   */
  private customerEmail(input: { context?: { customer?: { email?: string } } }): string {
    const email = input.context?.customer?.email;
    if (!email) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Paystack requires a customer email to initialize a transaction",
      );
    }
    return email;
  }

  async initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentOutput> {
    const email = this.customerEmail(input);

    if (this.options_.channel === "bank_transfer") {
      // account_expires_at is REQUIRED by Paystack's API (confirmed
      // live -- omitting it 400s), not optional as the docs summary
      // implied. 30 minutes is comfortably inside Paystack's own
      // accepted range (15 min - 8 hours).
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const charge = await this.client_.chargeBankTransfer({
        amountKobo: this.toKobo(input.amount),
        email,
        expiresAt,
      });

      return {
        id: charge.reference,
        data: {
          reference: charge.reference,
          account_name: charge.account_name,
          account_number: charge.account_number,
          bank_name: charge.bank.name,
          account_expires_at: charge.account_expires_at,
        },
        status: "pending",
      };
    }

    const reference = `eshor_${randomUUID()}`;

    const tx = await this.client_.initializeTransaction({
      amountKobo: this.toKobo(input.amount),
      email,
      currencyCode: input.currency_code.toUpperCase(),
      reference,
    });

    return {
      id: reference,
      data: {
        reference,
        authorization_url: tx.authorization_url,
        access_code: tx.access_code,
      },
      // card/USSD require the customer to complete an action on
      // Paystack's side before this is ever "authorized" -- pending
      // until the webhook or a status poll confirms it.
      status: "pending",
    };
  }

  async updatePayment(input: UpdatePaymentInput): Promise<UpdatePaymentOutput> {
    // Paystack transactions can't have their amount changed once
    // initialized (no PATCH endpoint) -- re-initiate a fresh one, same
    // as a cart total change forcing a new payment session upstream.
    const result = await this.initiatePayment(input);
    return { data: result.data, status: result.status };
  }

  async deletePayment(input: DeletePaymentInput): Promise<DeletePaymentOutput> {
    // Nothing to delete on Paystack's side for an uncaptured transaction
    // -- it simply expires. Pass the data through unchanged.
    return { data: input.data };
  }

  async authorizePayment(input: AuthorizePaymentInput): Promise<AuthorizePaymentOutput> {
    const reference = input.data?.reference as string | undefined;
    if (!reference) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing Paystack reference");
    }

    const tx = await this.client_.verifyTransaction(reference);

    if (tx.status === "success") {
      // Paystack auto-captures on a successful charge -- there is no
      // separate "authorized but not captured" state the way card
      // networks model it elsewhere. Report "authorized"; capturePayment
      // is effectively a pass-through confirming this.
      return { status: "authorized", data: { ...input.data, ...tx } };
    }
    if (tx.status === "failed" || tx.status === "reversed" || tx.status === "abandoned") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `Paystack transaction ${tx.status}`);
    }
    // pending / ongoing / queued -- e.g. bank transfer or USSD not yet
    // completed by the customer.
    return { status: "pending_authorization", data: { ...input.data, ...tx } };
  }

  async capturePayment(input: CapturePaymentInput): Promise<CapturePaymentOutput> {
    // See authorizePayment: Paystack has no separate capture step for
    // the channels P1 supports (card, USSD, transfer all auto-capture
    // on success). Pass through.
    return { data: input.data };
  }

  async cancelPayment(input: CancelPaymentInput): Promise<CancelPaymentOutput> {
    return { data: input.data };
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentOutput> {
    const reference = input.data?.reference as string | undefined;
    if (!reference) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Missing Paystack reference");
    }
    const refund = await this.client_.refund({
      transactionReference: reference,
      amountKobo: this.toKobo(input.amount),
    });
    return { data: { ...input.data, last_refund: refund } };
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentOutput> {
    const reference = input.data?.reference as string | undefined;
    if (!reference) return { data: input.data };
    const tx = await this.client_.verifyTransaction(reference);
    return { data: { ...input.data, ...tx } };
  }

  async getPaymentStatus(input: GetPaymentStatusInput): Promise<GetPaymentStatusOutput> {
    const reference = input.data?.reference as string | undefined;
    if (!reference) return { status: "pending" };

    let tx: PaystackTransaction;
    try {
      tx = await this.client_.verifyTransaction(reference);
    } catch (err) {
      if (err instanceof PaystackApiError && err.status === 404) {
        return { status: "pending" };
      }
      throw err;
    }

    switch (tx.status) {
      case "success":
        return { status: "captured", data: { ...input.data, ...tx } };
      case "failed":
      case "reversed":
      case "abandoned":
        return { status: "error", data: { ...input.data, ...tx } };
      default:
        return { status: "pending_authorization", data: { ...input.data, ...tx } };
    }
  }

  /**
   * G-P1 (the single most important gotcha in this whole module): the
   * signature MUST be verified against the RAW body bytes, not a
   * re-serialized JSON.stringify of the parsed object -- any
   * whitespace/key-order difference breaks the HMAC. Medusa's
   * ProviderWebhookPayload.rawData is exactly what's needed here
   * (confirmed against the installed type definition).
   */
  async getWebhookActionAndData(
    payload: ProviderWebhookPayload["payload"],
  ): Promise<WebhookActionResult> {
    const { data, rawData, headers } = payload;

    const signature = headers["x-paystack-signature"] as string | undefined;
    if (!signature) {
      this.logger_.warn("Paystack webhook received with no x-paystack-signature header");
      return { action: "not_supported" };
    }

    const rawBody = typeof rawData === "string" ? rawData : rawData.toString("utf8");
    const computed = createHmac("sha512", this.options_.secretKey).update(rawBody).digest("hex");

    if (computed !== signature) {
      this.logger_.error("Paystack webhook signature verification FAILED -- rejecting");
      return { action: "not_supported" };
    }

    const event = data as { event?: string; data?: { reference?: string; amount?: number } };
    const reference = event.data?.reference;
    const amount = event.data?.amount;

    if (!reference || amount === undefined) {
      return { action: "not_supported" };
    }

    switch (event.event) {
      case "charge.success":
        return {
          action: "captured",
          data: { session_id: reference, amount: this.fromKobo(amount) },
        };
      case "charge.failed":
        return {
          action: "failed",
          data: { session_id: reference, amount: this.fromKobo(amount) },
        };
      default:
        return { action: "not_supported" };
    }
  }
}

export default PaystackProviderService;
