/**
 * Verifies the Pay-with-Transfer payment provider end-to-end through
 * Medusa's own store API (not the raw Paystack API directly) -- proves
 * the medusa-config.ts registration, the service.ts channel branching,
 * and client.ts's chargeBankTransfer all wire together correctly.
 *
 * Run (server must be up on :9000):
 *   npx tsx src/scripts/p1-4-transfer-drill.ts
 */
import { randomBytes } from "node:crypto";

const BASE = "http://localhost:9000";
const PUBLISHABLE_KEY = "pk_ab5ed2caf47a15d4e41a55f7735fad36f9a69b33cb9eefb3e77f7b7a322f7d0e";
const REGION_ID = "reg_01KXQDDHNG7RC6N57B505NJ6K7";

async function call(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-publishable-api-key": PUBLISHABLE_KEY,
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const email = `p14-transfer-drill-${randomBytes(4).toString("hex")}@eshor.dev`;
  const password = randomBytes(18).toString("base64url");

  const reg = await call("POST", "/auth/customer/emailpass/register", { email, password });
  if (reg.status !== 200) throw new Error(JSON.stringify(reg.json));
  const login = await call("POST", "/auth/customer/emailpass", { email, password });
  if (login.status !== 200) throw new Error(JSON.stringify(login.json));
  const auth = { authorization: `Bearer ${login.json.token as string}` };
  await call("POST", "/store/customers", { email }, auth);
  // Re-login after customer creation -- the pre-creation token isn't
  // scoped to the new Customer record yet (same fix as
  // p1-4-checkout-guest-drill.ts; see silentGuestAuth's own comment).
  const relogin = await call("POST", "/auth/customer/emailpass", { email, password });
  if (relogin.status !== 200) throw new Error(JSON.stringify(relogin.json));
  auth.authorization = `Bearer ${relogin.json.token as string}`;

  const cart = await call("POST", "/store/carts", { region_id: REGION_ID, email }, auth);
  if (![200, 201].includes(cart.status)) throw new Error(JSON.stringify(cart.json));
  const cartId = cart.json.cart.id as string;
  console.log(`1. cart created: ${cartId}`);

  const products = await call("GET", "/store/products?limit=1", undefined, auth);
  const variantId = products.json.products?.[0]?.variants?.[0]?.id;
  if (!variantId) throw new Error(`No product/variant found: ${JSON.stringify(products.json)}`);
  const lineItem = await call("POST", `/store/carts/${cartId}/line-items`, { variant_id: variantId, quantity: 1 }, auth);
  if (lineItem.status !== 200) throw new Error(JSON.stringify(lineItem.json));
  console.log(`1b. line item added (variant ${variantId})`);

  const paymentCollection = await call("POST", "/store/payment-collections", { cart_id: cartId }, auth);
  if (![200, 201].includes(paymentCollection.status)) {
    throw new Error(JSON.stringify(paymentCollection.json));
  }
  const paymentCollectionId = paymentCollection.json.payment_collection.id as string;
  console.log("2. payment collection created");

  const paymentSession = await call(
    "POST",
    `/store/payment-collections/${paymentCollectionId}/payment-sessions`,
    { provider_id: "pp_paystack-transfer_paystack-transfer" },
    auth,
  );
  console.log(`3. transfer payment session -> ${paymentSession.status}`);
  if (paymentSession.status !== 200) throw new Error(JSON.stringify(paymentSession.json));

  const session = paymentSession.json.payment_collection.payment_sessions.find(
    (s: any) => s.provider_id === "pp_paystack-transfer_paystack-transfer",
  );
  console.log("   session.data:", JSON.stringify(session?.data, null, 2));

  if (!session?.data?.account_number || !session?.data?.bank_name) {
    throw new Error(`Missing account_number/bank_name in session data: ${JSON.stringify(session)}`);
  }

  console.log("");
  console.log("TRANSFER-DRILL-OK: real payment session created through Medusa's own store API,");
  console.log(`  account_number=${session.data.account_number} bank=${session.data.bank_name}`);
  console.log("  expires=" + session.data.account_expires_at);
}

main().catch((err) => {
  console.error("DRILL-FAILED:", err);
  process.exit(1);
});
