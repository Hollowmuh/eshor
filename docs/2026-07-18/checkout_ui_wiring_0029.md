# P1.4: wire up guest checkout on the eshor storefront

## Context

P0 is done; P1.1–P1.3 (order-state, delivery-zones, Paystack) are built and live-verified. P1.4's two prerequisites — silent guest auth (`silentGuestAuth` in `apps/storefront/src/lib/data/customer.ts:315-392`) and the delivery-zones-fulfillment provider (`apps/backend/src/modules/delivery-zones-fulfillment/service.ts`) — are built and unit/integration-tested, but **neither is actually wired into the checkout UI yet**. The checkout module (`apps/storefront/src/modules/checkout/*`) is still the untouched Medusa Next.js starter scaffold: `silentGuestAuth` has zero call sites, the shipping-address form's "State/Province" field is free text (not a Nigerian-state dropdown, so it won't reliably match `delivery-zones`' `state` column), and the Payment step only recognizes Stripe/PayPal/manual providers — nothing Paystack-aware.

Goal: make the existing checkout scaffold actually complete a real guest order end-to-end — address → delivery fee → Paystack payment → order confirmation — using the pieces already built, not rebuilding checkout from scratch.

## Key finding that shapes the approach

`apps/storefront/.env.local` already has `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` provisioned with a comment: *"Paystack publishable key (P1.4 checkout -- Inline.js runs client-side, needs this, not the secret key)"*. The backend's `PaystackProviderService.initiatePayment` (`apps/backend/src/modules/paystack/service.ts:138-161`) already returns `data.access_code` alongside `data.authorization_url` — `access_code` is exactly what Paystack's Inline.js v2 `resumeTransaction()` API needs. This means **the intended design was always a client-side popup (Inline.js), not a redirect flow** — no new callback route/page is needed. Confirmed via web search (two independent sources) that the pattern is:

```js
import PaystackPop from "@paystack/inline-js"
const popup = new PaystackPop()
popup.resumeTransaction(accessCode, {
  onSuccess: (response) => { /* proceed to server-side placeOrder() */ },
  onCancel: () => { /* let shopper retry */ },
})
```
Security model: the popup's `onSuccess` is just a UI signal. The actual trust boundary is unchanged — `placeOrder()` → Medusa's `completeCartWorkflow` → `authorizePayment()` (`service.ts:177-198`) already re-verifies the transaction server-side via `client_.verifyTransaction(reference)` against Paystack's real API before an order is created. Before writing the button component, the installed `node_modules/@paystack/inline-js` package's shipped `.d.ts` was read to confirm the exact method/callback signature — the search results were corroborated but not treated as a substitute for the installed types.

## Changes

1. **Backend:** none required — `initiatePayment` already returns `access_code`.
2. **Nigerian-state dropdown**: `shipping-address/index.tsx` — free-text province `Input` replaced with a `NativeSelect` populated from `NIGERIAN_STATES`, marked `required`.
3. **`silentGuestAuth` wired into `setAddresses`** (`lib/data/cart.ts`): called after `updateCart(data)` succeeds; `identity_exists` returns a sign-in error instead of redirecting.
4. **Paystack awareness in `constants.tsx`**: `pp_paystack_paystack` entry in `paymentInfoMap` + `isPaystack()` helper.
5. **`PaystackPaymentButton`** in `payment-button/index.tsx`: uses `@paystack/inline-js`'s `resumeTransaction(access_code)`, calls `placeOrder()` on success.

## Verification

1. Typecheck/build the storefront.
2. Drive a real guest checkout end-to-end against the running dev stack: cart → address (Lagos) → confirm ₦1,500 delivery fee → Paystack test-mode charge via the Inline popup → real order at `/order/{id}/confirmed`.
3. Drive the `identity_exists` path with a duplicate email across two guest sessions.