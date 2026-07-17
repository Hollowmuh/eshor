/**
 * P1.4 drill: proves the delivery-zones fulfillment provider actually
 * produces a real, correct cart shipping_total -- not just that it
 * boots and the shipping option exists, but that calculatePrice()
 * returns the SAME fee delivery-zones' own quoteFor() would, and that
 * setting it as the cart's shipping method makes shipping_total (and
 * therefore the eventual Paystack charge amount) reflect it.
 *
 * Run (server must be up on :9000):
 *   npx tsx src/scripts/p1-4-fulfillment-drill.ts
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
  const email = `p14-fulfillment-drill-${randomBytes(4).toString("hex")}@eshor.dev`;
  const password = randomBytes(18).toString("base64url");

  const reg = await call("POST", "/auth/customer/emailpass/register", { email, password });
  if (reg.status !== 200) throw new Error(JSON.stringify(reg.json));
  const regToken = reg.json.token as string;

  const createCustomer = await call("POST", "/store/customers", { email }, {
    authorization: `Bearer ${regToken}`,
  });
  if (![200, 201].includes(createCustomer.status)) throw new Error(JSON.stringify(createCustomer.json));

  const login = await call("POST", "/auth/customer/emailpass", { email, password });
  if (login.status !== 200) throw new Error(JSON.stringify(login.json));
  const auth = { authorization: `Bearer ${login.json.token as string}` };

  const cart = await call("POST", "/store/carts", { region_id: REGION_ID, email }, auth);
  if (![200, 201].includes(cart.status)) throw new Error(JSON.stringify(cart.json));
  const cartId = cart.json.cart.id as string;
  console.log(`1. cart created: ${cartId}`);

  const products = await call("GET", "/store/products?limit=1", undefined, auth);
  const variantId = products.json.products[0].variants[0].id as string;
  await call("POST", `/store/carts/${cartId}/line-items`, { variant_id: variantId, quantity: 1 }, auth);
  console.log(`2. line item added (variant ${variantId})`);

  // What delivery-zones itself would quote, straight from its own API --
  // this is the ground truth calculatePrice() must match exactly.
  const zonesQuote = await call("GET", `/store/delivery-zones?state=${STATE}`, undefined, auth);
  console.log(`3. delivery-zones quote for ${STATE}: fee_kobo=${zonesQuote.json.fee_kobo}`);

  // Set the shipping address -- calculatePrice reads province from here.
  const setAddress = await call(
    "POST",
    `/store/carts/${cartId}`,
    {
      shipping_address: {
        first_name: "Test",
        last_name: "Shopper",
        address_1: "1 Test Street",
        city: "Ikeja",
        province: STATE,
        postal_code: "100001",
        country_code: "ng",
        phone: "+2348012345678",
      },
    },
    auth,
  );
  console.log(`4. set shipping address (province=${STATE}) -> ${setAddress.status}`);
  if (setAddress.status !== 200) throw new Error(JSON.stringify(setAddress.json));

  const shippingOptions = await call(
    "GET",
    `/store/shipping-options?cart_id=${cartId}`,
    undefined,
    auth,
  );
  console.log(`5. shipping options -> ${shippingOptions.status}`);
  if (shippingOptions.status !== 200 || !shippingOptions.json.shipping_options?.length) {
    throw new Error(`No shipping options returned: ${JSON.stringify(shippingOptions.json)}`);
  }
  const option = shippingOptions.json.shipping_options[0];
  console.log(`   option: ${option.name} calculated_price.calculated_amount=${option.calculated_price?.calculated_amount}`);

  const setShipping = await call(
    "POST",
    `/store/carts/${cartId}/shipping-methods`,
    { option_id: option.id },
    auth,
  );
  console.log(`6. set shipping method -> ${setShipping.status}`);
  if (setShipping.status !== 200) throw new Error(JSON.stringify(setShipping.json));

  const finalCart = setShipping.json.cart;
  console.log("");
  console.log("=== RESULT ===");
  console.log("delivery-zones fee_kobo:   ", zonesQuote.json.fee_kobo);
  console.log("shipping option calc price:", option.calculated_price?.calculated_amount);
  console.log("cart.shipping_total:       ", finalCart.shipping_total);
  console.log("cart.item_total:           ", finalCart.item_total);
  console.log("cart.total:                ", finalCart.total);
  console.log("==============");

  if (finalCart.shipping_total !== zonesQuote.json.fee_kobo) {
    throw new Error(
      `MISMATCH: cart.shipping_total (${finalCart.shipping_total}) !== delivery-zones fee_kobo (${zonesQuote.json.fee_kobo})`,
    );
  }
  if (finalCart.total !== finalCart.item_total + finalCart.shipping_total) {
    throw new Error(
      `MISMATCH: cart.total (${finalCart.total}) !== item_total + shipping_total (${finalCart.item_total + finalCart.shipping_total})`,
    );
  }

  console.log("FULFILLMENT-DRILL-OK: cart total genuinely includes the real delivery-zones fee");
}

main().catch((err) => {
  console.error("DRILL-FAILED:", err);
  process.exit(1);
});
