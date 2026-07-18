# Post-checkout cleanup: seed onboarding, order confirmation, test-coverage gaps

## Context

P1.4 (guest checkout UI) is now wired and data-layer-verified. Three follow-on gaps were flagged and researched:

1. **Fresh clone / CI produce a non-working checkout.** `seed-delivery-zones.ts` and `seed-delivery-fulfillment.ts` are never run by `README.md`'s onboarding steps or `.github/workflows/ci.yml`'s `lighthouse` job — a fresh environment has no Nigeria delivery zones and no shipping option. `link-paystack-to-region.ts` has the same gap and is included too, since without it Paystack never appears as a payment option on a fresh environment.
2. **The order confirmation page is 100% unmodified Medusa/Stripe starter content.** Scope confirmed with the user: fix the confirmation page's content only — no tracking page, no WhatsApp integration (separate future work; the tracking-token/HMAC primitive already exists idle in `packages/kernel/src/transition-db.ts`).
3. **Test-coverage gaps**: DB-backed backend suites aren't in CI; `apps/storefront` has zero test coverage despite `silentGuestAuth`'s real branching logic now being live in the checkout flow.

## Changes

1. **Seed scripts**: add `seed-delivery-zones.ts` → `seed-delivery-fulfillment.ts` → `link-paystack-to-region.ts` (all confirmed idempotent) to both `README.md`'s numbered onboarding steps and `ci.yml`'s `lighthouse` job, between the existing `seed-demo.ts` and `remove-starter-samples.ts` steps.
2. **Order confirmation page** (`apps/storefront/src/modules/order/templates/order-completed-template.tsx`): add a delivery ETA/fee summary and a WhatsApp contact CTA using data already on the `order` object — no backend changes.
3. **CI test wiring**: add `test:integration:modules`/`test:integration:http` steps to `ci.yml`'s `quality` job (no separate `medusa db:migrate` needed — `medusaIntegrationTestRunner` self-migrates a scratch database, confirmed from the installed `@medusajs/test-utils` source).
4. **Storefront tests**: add Vitest (matching `packages/kernel`/`packages/image-pipeline`'s existing convention, not jest) to `apps/storefront`, with unit tests for `silentGuestAuth`'s four real branches (ok / identity_exists / already-authenticated / error) via `vi.mock` on `@lib/config` and `./cookies`.

## Verification

- Run all three seed scripts locally in the new order against the dev DB.
- `pnpm --filter @eshor/backend test:integration:modules`/`test:integration:http` pass locally with the same command CI will run.
- New Vitest suite passes, and is proven to catch a real regression (temporarily break `identity_exists` detection, watch it fail, revert).
- Confirmation-page changes reviewed by code inspection only — no browser tool available this session, same caveat as the Paystack popup work.
