/**
 * P1.3 live drill -- proves a real payment session reaches Paystack's
 * actual test-mode API (a genuine HTTPS call to api.paystack.co using the
 * real sk_test_ key) and returns a real authorization_url.
 *
 * ROOT CAUSE this drill exists to prove the fix for: Medusa v2's
 * createPaymentSessionsWorkflow only populates `context.customer` (which
 * every payment provider needs to read the shopper's email from) when the
 * store API request carries `customer_id` -- and the store's
 * POST /store/payment-collections/:id/payment-sessions route sources that
 * customer_id ONLY from `req.auth_context?.actor_id` (an authenticated
 * JWT), never from the cart's own linked customer_id. This is true even
 * for a guest cart that already has a real linked Customer record from
 * setting an email on it. Confirmed by reading the actual installed
 * source: @medusajs/core-flows/dist/payment-collection/workflows/
 * create-payment-session.js (the `when("customer-id-exists", ...)` branch)
 * and @medusajs/medusa/dist/api/store/payment-collections/[id]/
 * payment-sessions/route.js (`customer_id: req.auth_context?.actor_id`).
 *
 * The fix: silently register + log in a guest via emailpass auth (random
 * password, never surfaced to the shopper) before creating the payment
 * session, so `req.auth_context.actor_id` resolves and Medusa's own
 * unmodified workflow does the rest. No change to the Paystack provider
 * itself was needed -- customerEmail() already correctly read
 * context.customer.email; it just never received a populated one.
 * This silent-guest-auth step is now a required part of P1.4's checkout
 * flow, not just this drill.
 *
 * Run (server must be up on :9000):
 *   npx tsx src/scripts/p1-3-paystack-live-drill.ts
 */
import { randomBytes } from "node:crypto";

const BASE = "http://localhost:9000";
const PUBLISHABLE_KEY = "pk_ab5ed2caf47a15d4e41a55f7735fad36f9a69b33cb9eefb3e77f7b7a322f7d0e";
const REGION_ID = "reg_01KXQDDHNG7RC6N57B505NJ6K7"; // Nigeria (confirmed via GET /store/regions)

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
  const email = `p13-guest-drill-${randomBytes(4).toString("hex")}@eshor.dev`;
  const password = randomBytes(18).toString("base64url");
  console.log(`guest email: ${email}`);

  const reg = await call("POST", "/auth/customer/emailpass/register", { email, password });
  console.log(`1. register -> ${reg.status}`);
  if (reg.status !== 200) throw new Error(JSON.stringify(reg.json));
  const regToken = reg.json.token as string;

  const createCustomer = await call("POST", "/store/customers", { email }, {
    authorization: `Bearer ${regToken}`,
  });
  console.log(`2. create customer -> ${createCustomer.status}`);
  if (![200, 201].includes(createCustomer.status)) throw new Error(JSON.stringify(createCustomer.json));

  const login = await call("POST", "/auth/customer/emailpass", { email, password });
  console.log(`3. login -> ${login.status}`);
  if (login.status !== 200) throw new Error(JSON.stringify(login.json));
  const token = login.json.token as string;
  const auth = { authorization: `Bearer ${token}` };

  const cart = await call("POST", "/store/carts", { region_id: REGION_ID, email }, auth);
  console.log(`4. create cart -> ${cart.status}`);
  if (![200, 201].includes(cart.status)) throw new Error(JSON.stringify(cart.json));
  const cartId = cart.json.cart.id as string;
  console.log(`   cart_id=${cartId} customer_id=${cart.json.cart.customer_id}`);

  const products = await call("GET", "/store/products?limit=1", undefined, auth);
  if (products.status !== 200 || !products.json.products?.length) {
    throw new Error(`5. no products found -> ${JSON.stringify(products.json)}`);
  }
  const variantId = products.json.products[0].variants[0].id as string;
  console.log(`5. variant_id=${variantId}`);

  const lineItem = await call(
    "POST",
    `/store/carts/${cartId}/line-items`,
    { variant_id: variantId, quantity: 1 },
    auth,
  );
  console.log(`6. add line item -> ${lineItem.status}`);
  if (![200, 201].includes(lineItem.status)) throw new Error(JSON.stringify(lineItem.json));

  const payCol = await call("POST", "/store/payment-collections", { cart_id: cartId }, auth);
  console.log(`7. create payment collection -> ${payCol.status}`);
  if (![200, 201].includes(payCol.status)) throw new Error(JSON.stringify(payCol.json));
  const payColId = payCol.json.payment_collection.id as string;
  console.log(`   pay_col_id=${payColId}`);

  const session = await call(
    "POST",
    `/store/payment-collections/${payColId}/payment-sessions`,
    { provider_id: "pp_paystack_paystack" },
    auth,
  );
  console.log(`8. create payment session (authenticated) -> ${session.status}`);
  if (![200, 201].includes(session.status)) throw new Error(JSON.stringify(session.json));

  const sessionData = session.json.payment_collection.payment_sessions[0].data as {
    reference?: string;
    authorization_url?: string;
    access_code?: string;
  };

  console.log("");
  console.log("=== PAYSTACK LIVE DRILL RESULT ===");
  console.log("reference:         ", sessionData.reference);
  console.log("authorization_url: ", sessionData.authorization_url);
  console.log("access_code:       ", sessionData.access_code);
  console.log("===================================");

  if (!sessionData.reference || !sessionData.authorization_url) {
    throw new Error("DRILL-FAILED: no reference/authorization_url returned");
  }

  console.log("PAYSTACK-LIVE-DRILL-OK: real transaction initialized against Paystack test mode");
}

main().catch((err) => {
  console.error("DRILL-FAILED:", err);
  process.exit(1);
});
