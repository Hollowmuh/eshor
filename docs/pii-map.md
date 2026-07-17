# PII Map

Started per hardening spec §1.4 (P0 day 10). This is a live document —
update it whenever a field that stores personal data is added, not
retroactively before an audit. `customers`/`orders` tables don't exist
yet (P1); rows below are marked accordingly.

| Field | Table / source | Purpose | Retention | Deletion behavior | Status |
|---|---|---|---|---|---|
| email | `customer` (Medusa core) | Identity/login key (magic link / OTP), receipts | Life of account | Anonymize: hash email, clear name, wipe address on deletion request | P1 |
| phone (E.164) | `customer` (Medusa core) | Courier delivery, WhatsApp order updates | Life of account | Same as email — anonymize, not delete (financial rows reference it) | P1 |
| name | `customer` (Medusa core) | Delivery label, WhatsApp greeting, review byline | Life of account | Replaced with "deleted" placeholder on deletion request | P1 |
| delivery address | `order` (Medusa core) | Courier dispatch | Per order, then archival | Wiped on deletion request; order financials (amounts, dates) retained for FIRS | P1 |
| device fingerprint / IP | auth event log | SIM-swap / account-takeover anomaly detection (hardening §1.1) | 90 days | Auto-purged on TTL, not user-deletable (fraud-control exemption) | P1 |
| WhatsApp message bodies | `WhatsAppMessage` (planned) | Order updates, fit survey, support | 90 days then pruned | Auto-purged — highest-sensitivity, lowest long-term value (hardening §1.4) | P1 |
| review photos | uploaded to image provider (Cloudflare Images / local disk) | PDP fit gallery | Life of publication, or until unpublished | EXIF/GPS stripped at upload (proven, `packages/image-pipeline` test suite); original deleted via provider `delete()` on unpublish | **Built (P0)** |
| session cookie | httpOnly cookie | Auth session | 30-day sliding | Expires; revoked centrally on password/email-auth reset | P1 |
| device fingerprint (kernel `redactPhone`) | logs | Debug/support | Log retention policy (not yet set) | `redactPhone()` in `packages/kernel/src/phone.ts` already masks phone numbers before they reach structured logs (`+234•••••••4567`) | **Built (P0)** |

## What P0 actually stores today

No `customer` or `order` table exists yet — P0 is catalog-only (E1/E2).
The only P0-scope data with any privacy surface:

- **Review/product images** (`packages/image-pipeline`): uploaded images are
  re-encoded through `sharp` before ever reaching a provider, which strips
  EXIF/GPS by default (never calling `.withMetadata()`) — verified by
  `packages/image-pipeline/test/lqip.test.ts`, which embeds real EXIF via
  `sharp.withExif()`, confirms it's present in the source, then confirms
  it's gone after processing.
- **Admin auth** (Medusa's own `admin_user` / JWT): out of scope for this
  map — Medusa core's own auth module, not eshor-authored data.

## P1 obligations this map creates (tracked, not yet built)

1. Deletion-request command: anonymize `customer` row (phone → hash, name →
   "deleted", address wiped) while `order` financial fields persist (FIRS
   retention requirement, Layer 7 §1).
2. NDPA privacy notice + two separate consent checkboxes at checkout
   (transactional vs marketing WhatsApp — feature spec E9, amended
   2026-07-16 for email-primary identity).
3. Auth event log (device fingerprint + IP) for the SIM-swap/account-
   takeover step-up rule (hardening §1.1) — 90-day TTL.
4. WhatsApp message body pruning job (90 days).
