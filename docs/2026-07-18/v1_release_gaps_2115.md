# Toward a real V1: privacy/policy, Paystack transfer, order tracking, then push + real CI

## Context

Per eshor's own master PRD, V1 (MVP = P0+P1) release criteria explicitly require an NDPA privacy notice + consent, published policies, Pay with Transfer, and a tracking page. None existed as of this morning. OTP stays deliberately out (already descoped in the P1.4 plan); checkout requires no verification step.

## 1. Privacy notice + consent capture
New `/privacy` and `/policies` storefront routes with draft NDPA-shaped copy (grounded in `docs/pii-map.md`'s real field list, clearly marked pending legal review). Consent checkbox added to the checkout address step, required to proceed. Footer links added.

## 2. Paystack Pay with Transfer
Same `/charge` endpoint as USSD, `bank_transfer: {}` instead of `ussd`. Key finding: Medusa's own `processPaymentWorkflow` (in `@medusajs/core-flows`) already auto-completes a cart into a real order via `completeCartAfterPaymentStep` once a webhook reports success for a session linked to a cart with no order yet — no new backend completion logic needed. Registered as a second Paystack provider instance (`paystack-transfer`) in `medusa-config.ts`. Response shape verified via one real test-mode `/charge` call before finalizing the storefront panel.

## 3. Order tracking
Uses the existing `trackingToken` (kernel's `ensureOrderState`/`getOrderStateByTrackingToken`) as a standalone bearer-capability token — NOT `computeTrackingProof` (a separate, unused HMAC primitive in the same file; using both would be redundant). New backend routes: `GET /store/orders/track/:token` (minimal projection, state + first name + city only) and `GET /store/orders/:id/tracking-token` (so the confirmation page can fetch its own order's token). New storefront `/track/[token]` page with a state-machine stepper, linked from the confirmation page.

## 4. Commit, push, real CI
Commit the session's ~27 uncommitted files in logical chunks, create a new private GitHub repo, push, and watch the actual GitHub Actions run (`gh run watch`) — the Lighthouse job has only ever been simulated locally until now.

## Verification
Consent gate blocks checkout when unchecked. Real transfer charge completes an order with zero frontend `placeOrder()` call. Tracking page reflects real order state. Full test suite green. Real CI green on actual GitHub Actions infrastructure.