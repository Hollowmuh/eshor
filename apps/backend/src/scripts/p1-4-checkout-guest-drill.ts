/**
 * P1.4 drill: proves the storefront's actual checkout wiring (this
 * session's change, not yet browser-tested -- no browser automation
 * tool is available in this environment) is correct at the HTTP layer,
 * by replaying the exact request sequence setAddresses/silentGuestAuth
 * and the Payment step make: an anonymous guest cart -> address with a
 * real Nigerian state -> silentGuestAuth's own register/login/transfer
 * sequence -> shipping options priced by delivery-zones-fulfillment ->
 * a real Paystack payment session with an access_code ready for
 * Inline.js. Does NOT complete a real charge (that needs a human in
 * Paystack's card-entry UI) -- everything up to the "Place order" click
 * is covered.
 *
 * Run (server must be up on :9000):
 *   npx tsx src/scripts/p1-4-checkout-guest-drill.ts
 */
import { randomBytes } from "node:crypto";

const BASE = "http://localhost:9000";
const PUBLISHABLE_KEY = "pk_ab5ed2caf47a15d4e41a55f7735fad36f9a69b33cb9eefb3e77f7b7a322f7d0e";
const REGION_ID = "reg_01KXQDDHNG7RC6N57B505NJ6K7"; // Nigeria
const STATE = "Lagos";

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
  const email = `p14-checkout-drill-${randomBytes(4).toString("hex")}@eshor.dev`;

  // 1. Anonymous guest cart -- no auth token at all, matching a real
  // first-time shopper before setAddresses ever runs.
  const cart = await call("POST", "/store/carts", { region_id: REGION_ID, email });
  if (![200, 201].includes(cart.status)) throw new Error(JSON.stringify(cart.json));
  const cartId = cart.json.cart.id as string;
  console.log(`1. anonymous guest cart created: ${cartId}`);

  const products = await call("GET", "/store/products?limit=1");
  const variantId = products.json.products?.[0]?.variants?.[0]?.id;
  if (!variantId) throw new Error(`No product/variant found: ${JSON.stringify(products.json)}`);

  const lineItem = await call("POST", `/store/carts/${cartId}/line-items`, {
    variant_id: variantId,
    quantity: 1,
  });
  if (lineItem.status !== 200) throw new Error(JSON.stringify(lineItem.json));
  console.log(`2. line item added (variant ${variantId})`);

  // 3. Set shipping address with a real Nigerian state -- exactly what
  // the new NativeSelect dropdown now forces (previously free text).
  const setAddress = await call("POST", `/store/carts/${cartId}`, {
    email,
    shipping_address: {
      first_name: "Guest",
      last_name: "Shopper",
      address_1: "1 Test Street",
      city: "Ikeja",
      province: STATE,
      postal_code: "100001",
      country_code: "ng",
      phone: "+2348012345678",
    },
  });
  console.log(`3. set shipping address (province=${STATE}, unauthenticated) -> ${setAddress.status}`);
  if (setAddress.status !== 200) throw new Error(JSON.stringify(setAddress.json));

  // 4. Replay silentGuestAuth's own sequence (customer.ts:315-392): a
  // random-password register + login + transferCart. This is the exact
  // HTTP contract that function relies on, now invoked from
  // setAddresses right after the email is known.
  const password = randomBytes(24).toString("base64url");
  const reg = await call("POST", "/auth/customer/emailpass/register", { email, password });
  if (reg.status !== 200) throw new Error(`register failed: ${JSON.stringify(reg.json)}`);
  let token = reg.json.token as string;

  const login = await call("POST", "/auth/customer/emailpass", { email, password });
  if (login.status !== 200) throw new Error(`login failed: ${JSON.stringify(login.json)}`);
  token = login.json.token as string;
  const auth = { authorization: `Bearer ${token}` };

  const customerExists = await call("GET", "/store/customers/me", undefined, auth);
  if (customerExists.status !== 200) {
    const create = await call("POST", "/store/customers", { email }, auth);
    if (![200, 201].includes(create.status)) throw new Error(`customer create failed: ${JSON.stringify(create.json)}`);
    // Matches silentGuestAuth's own sequence exactly (customer.ts:371-374):
    // the pre-customer-creation token isn't properly scoped to the new
    // Customer record -- a fresh login afterward is required, or the
    // next authenticated call (transferCart) 401s. Proved live: this was
    // missing on the first run of this drill and reproduced exactly
    // that 401.
    const relogin = await call("POST", "/auth/customer/emailpass", { email, password });
    if (relogin.status !== 200) throw new Error(`re-login failed: ${JSON.stringify(relogin.json)}`);
    token = relogin.json.token as string;
    auth.authorization = `Bearer ${token}`;
  }

  const transfer = await call("POST", `/store/carts/${cartId}/customer`, {}, auth);
  console.log(`4. silentGuestAuth sequence replayed (register+login+transfer) -> ${transfer.status}`);
  if (transfer.status !== 200) throw new Error(`transferCart failed: ${JSON.stringify(transfer.json)}`);

  // 5. Shipping options, now that the address has a real Nigerian
  // state -- must be priced by delivery-zones-fulfillment.
  const shippingOptions = await call("GET", `/store/shipping-options?cart_id=${cartId}`, undefined, auth);
  if (shippingOptions.status !== 200 || !shippingOptions.json.shipping_options?.length) {
    throw new Error(`No shipping options returned: ${JSON.stringify(shippingOptions.json)}`);
  }
  const option = shippingOptions.json.shipping_options[0];
  console.log(`5. shipping option "${option.name}" calculated_amount=${option.calculated_price?.calculated_amount}`);

  const setShipping = await call(
    "POST",
    `/store/carts/${cartId}/shipping-methods`,
    { option_id: option.id },
    auth,
  );
  if (setShipping.status !== 200) throw new Error(JSON.stringify(setShipping.json));
  console.log(`6. shipping method set -> cart.shipping_total=${setShipping.json.cart.shipping_total}`);

  // 7. Payment collection + a real Paystack payment session, using the
  // NOW-authenticated request -- this is the whole reason
  // silentGuestAuth exists: Paystack's customerEmail() reads
  // context.customer.email, which Medusa only populates from an
  // authenticated actor_id.
  const paymentCollection = await call(
    "POST",
    `/store/payment-collections`,
    { cart_id: cartId },
    auth,
  );
  if (![200, 201].includes(paymentCollection.status)) {
    throw new Error(`payment-collection create failed: ${JSON.stringify(paymentCollection.json)}`);
  }
  const paymentCollectionId = paymentCollection.json.payment_collection.id as string;

  const paymentSession = await call(
    "POST",
    `/store/payment-collections/${paymentCollectionId}/payment-sessions`,
    { provider_id: "pp_paystack_paystack" },
    auth,
  );
  console.log(`7. Paystack payment session -> ${paymentSession.status}`);
  if (paymentSession.status !== 200) {
    throw new Error(`payment-session create failed: ${JSON.stringify(paymentSession.json)}`);
  }

  const session = paymentSession.json.payment_collection.payment_sessions.find(
    (s: any) => s.provider_id === "pp_paystack_paystack",
  );
  const accessCode = session?.data?.access_code;
  console.log(`   access_code present: ${!!accessCode}`);
  if (!accessCode) {
    throw new Error(`No access_code in Paystack session data: ${JSON.stringify(session)}`);
  }

  console.log("");
  console.log("CHECKOUT-GUEST-DRILL-OK: guest cart -> Nigerian-state address -> silent guest auth ->");
  console.log("  real delivery fee -> authenticated Paystack session with access_code, ready for Inline.js.");
  console.log("  (Not covered: the actual PaystackPop.resumeTransaction() popup + card entry -- no browser");
  console.log("  automation tool is available in this environment to drive that.)");
}

main().catch((err) => {
  console.error("DRILL-FAILED:", err);
  process.exit(1);
});
