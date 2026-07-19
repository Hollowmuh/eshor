# Deploy eshor's storefront on the same GCP VM as the backend

## Context

The backend is now live at `http://34.170.59.149:9000` (see [[eshor-gcp-deployment]] memory). The storefront currently only runs locally (`next dev` in WSL) — deploying it on the **same** GCP VM rather than Vercel (the original architecture doc's plan), which is a reasonable call at this stage: one fewer service to wire up, no new account/billing surface, and the VM already has the headroom (e2-standard-2, currently running Postgres+Redis+Medusa comfortably).

Storefront's `package.json` has the same `"packageManager": "npm@11.16.0"` pin as backend (same corepack gotcha, same `pnpm --filter` + `npx` workaround already proven today). `next.config.js` already sets `eslint.ignoreDuringBuilds`/`typescript.ignoreBuildErrors`, so — unlike the backend build — no pre-existing TS errors are expected to surprise us. No `output: "standalone"`, so this follows the same "build and run from the same full-workspace image" approach as the backend, not a slim multi-stage extraction. Only one env var is hard-required at boot (`check-env-variables.js`): `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`.

**Key Next.js-specific wrinkle**: `NEXT_PUBLIC_*` vars are baked into the client JS bundle at **build time**, not read at runtime — so they must be passed as Docker build args, not just container `environment:`.

## 1. New GCP resource

- **Firewall rule** `eshor-backend-allow-storefront`: new rule, tag `eshor-backend` (same VM), allow inbound tcp:8000 from 0.0.0.0/0. Kept separate from `eshor-backend-allow-medusa` (one rule per exposed service, easy to reason about/remove later).

## 2. New repo artifacts

- **`apps/storefront/Dockerfile`**: same shape as `apps/backend/Dockerfile` — monorepo-root build context, `pnpm install --frozen-lockfile`, then `pnpm --filter @eshor/storefront run build` (via `--filter` from root, not `cd apps/storefront`, for the same corepack-pin reason as backend). Build args for every `NEXT_PUBLIC_*` var, `ARG`+`ENV`'d before the build step so Next.js's build actually embeds them. `network_mode: host` at runtime (matching backend, and letting it reach the backend via `127.0.0.1:9000` with zero extra networking config — no need to re-litigate the bridge-network gotcha from today). CMD: `npx next start -p 8000` from `apps/storefront` (no `.medusa/server`-style relocation needed — Next's own build output stays in `apps/storefront/.next`, read correctly from that same directory, unlike Medusa's build).
- **`docker-compose.prod.yml`**: add a `storefront` service, `network_mode: host`, `depends_on: backend` (informational — not a hard readiness gate, matches how the backend itself doesn't block on migrations via `depends_on`). Build args sourced from the existing root `.env` (extend it with the storefront-specific values below) plus values already known (backend URL, publishable key).

## 3. Env values (add to the VM's existing root `.env`)

- `NEXT_PUBLIC_MEDUSA_BACKEND_URL=http://127.0.0.1:9000` (same-VM, host networking)
- `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_d56c345c5cc10b1d05ad43c48b4d5cd01ad9c3eacca3c9d8d6baf4f6a60a4606` (the prod key already created today, linked to the sales channel)
- `NEXT_PUBLIC_DEFAULT_REGION=ng`
- `NEXT_PUBLIC_BASE_URL=http://34.170.59.149:8000`
- `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=pk_test_db7ff6e56d2fb85379ac39a99c3ccd710d259285` (reused test key, matches the test secret key already wired server-side — not a real secret, safe to reuse)
- `NEXT_PUBLIC_WHATSAPP_NUMBER=2349138589608`

## 4. Deploy sequence

1. Add the firewall rule.
2. Commit + push the new Dockerfile/compose changes; pull on the VM.
3. Append the new env values to the VM's root `.env`.
4. `docker compose -f docker-compose.prod.yml up -d --build storefront`.
5. Verify.

## Verification

1. `curl http://34.170.59.149:8000/ng` → real HTML (home page), not an error page.
2. Load the PLP (`/ng/store` or equivalent) and confirm the 12 seeded products render — proves the storefront container is actually reaching the deployed backend, not just serving static shell HTML.
3. `docker compose ps` shows `storefront` healthy/running; check logs for a clean Next.js boot (no missing-env-var exit, no fetch errors to the backend).
4. Confirm `docker compose -f docker-compose.prod.yml up -d` (no explicit service) still brings up all four containers correctly together, in case anything about `network_mode: host` ordering matters.

## Explicitly still deferred

Domain + TLS/Caddy (storefront stays on bare `:8000` for now, same as backend's `:9000`), imgproxy, checkout end-to-end click-through testing (no browser automation tool in this environment — same limitation as earlier in the session), switching Paystack to live keys.
