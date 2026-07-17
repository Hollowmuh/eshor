# eshor

D2C clothing storefront for Nigeria. Medusa 2.x backend + Next.js 15
storefront, monorepo (pnpm workspaces).

Full research and planning docs live outside this repo, in
`Abdul/eshor/docs/` — architecture decisions, feature specs, the
operations runbook, and the P0 build plan this repo implements.

## Prerequisites

- **WSL2 (Ubuntu) on Windows, or native Linux/macOS.** Medusa's tooling
  has documented issues on native Windows (symlink creation failures) —
  develop inside WSL2, with the repo cloned into the Linux filesystem
  (`~/dev/eshor`), never under `/mnt/c/...`.
- Node 24, pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- Docker (for Postgres + Redis)

## Fresh clone → browsable store

```bash
git clone <repo> ~/dev/eshor && cd ~/dev/eshor
pnpm install

# 1. infra
docker compose -f docker-compose.dev.yml up -d --wait

# 2. eshor_core spine schema (outbox/ledger/reservations/state machine —
#    separate from Medusa's own schema, see packages/kernel/migrations)
DATABASE_URL=postgres://eshor:eshor_dev@localhost:5432/eshor pnpm --filter @eshor/kernel migrate

# 3. backend: migrate (Medusa core + garmentFit custom module), then boot
cp apps/backend/.env.template apps/backend/.env   # fill in real secrets for anything beyond local dev
cd apps/backend
npx medusa db:migrate
npx medusa develop &         # backend on :9000; wait for /health to return 200

# 4. one-time: admin user + publishable key (dev credentials — change
#    DevAdmin_ChangeMe1 for anything beyond a throwaway local instance)
npx medusa user -e admin@eshor.dev -p DevAdmin_ChangeMe1
../../scripts/create-pub-key.sh   # prints a pk_... token

# 5. put that token in apps/storefront/.env.local:
#    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_...
#    NEXT_PUBLIC_DEFAULT_REGION=ng

# 6. seed: creates the Nigeria/NGN region + 12 demo products with real
#    graded garment measurements, then proves the publish guard works
npx medusa exec ./src/scripts/seed-demo.ts

# 7. remove the starter template's 4 sample products (unoptimized demo
#    images that blow the perf budget — see git log for the story)
npx medusa exec ./src/scripts/remove-starter-samples.ts

# 8. storefront
cd ../storefront
npx next dev --turbopack -p 8000
```

Then visit `http://localhost:8000/ng`.

**Honest note on step count:** the P0 plan's exit criterion phrased this
as `pnpm i && docker compose up && pnpm dev && pnpm seed:demo`. The real
sequence has a few more one-time steps (admin user, publishable key,
env wiring) that aren't yet automated into a single command — a good
P1 polish item (`pnpm bootstrap` wrapping steps 2–7) but not done here.
Every step above has been run for real, in this order, against a clean
database, this session.

## Verify it's working

```bash
./scripts/synthetic-check.sh   # health, home, PLP, PDP, 404 handling
```

## Testing

```bash
pnpm test        # kernel + image-pipeline unit/property tests
# spine integration tests (real Postgres, incl. the drop-day stock race
# test and the ledger-immutability proof) need DATABASE_URL set:
DATABASE_URL=postgres://eshor:eshor_dev@localhost:5432/eshor \
DATABASE_URL_LEDGER_TEST=postgres://eshor_app:eshor_app_dev@localhost:5432/eshor \
pnpm test
```

## Backup / restore

```bash
./scripts/restore-drill.sh   # real dump -> drop -> restore -> verify cycle
```

Run this after any change to `packages/kernel/migrations/` — it caught
a real bug once (a `pg_dump` flag that silently stripped the `eshor_app`
role's permissions; see git log `a6dd0c4`).

## Perf budgets

```bash
cd apps/storefront && npx next build && npx next start -p 8000 &
cd ../.. && npx @lhci/cli autorun --config=lighthouserc.json
```

Home/PLP/PDP must stay under 512KB total-byte-weight and 5000ms LCP on
a throttled mobile profile (1.6Mbps, 4x CPU slowdown).

## Repo layout

```
apps/backend      Medusa 2.x — catalog, garment-fit module, custom API routes
apps/storefront   Next.js 15 — Home/PLP/PDP, trust strip, fit panel
packages/kernel    Money/Phone/order-state-machine/outbox/ledger — the invariant kernel
packages/image-pipeline   Provider-agnostic image upload (Cloudflare Images / local-disk), EXIF strip, LQIP
scripts/          Dev + drill scripts (restore drill, synthetic check, debug helpers)
```
