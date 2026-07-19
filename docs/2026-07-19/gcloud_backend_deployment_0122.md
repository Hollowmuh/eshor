# Deploy eshor's backend to GCP (Phase 1: VM smoke deploy, no domain yet)

## Context

Eshor's backend has never run anywhere but a local dev machine. Your own architecture decision doc (`eshor/docs/2026-07-16/platform_architecture_decision_0106.md`, §7) already settled the target topology: one GCP `e2-standard-2` VM running Docker Compose (medusa, postgres, redis, imgproxy, caddy), storefront on Vercel, nightly `pg_dump` to GCS with a weekly restore test. That doc also lists the domain (`.ng` vs `.com`) as an open PRD question (Q1) — still true today, nothing's been bought.

You confirmed: reuse the existing `hollowmuh-portfolio` GCP project (billing already active, Compute Engine + Storage APIs already enabled), and deploy without a domain for now — reachable via the VM's IP for smoke-testing, with Caddy/TLS/imgproxy/Cloudflare and the storefront-on-Vercel wiring deferred until a domain exists. That's what this plan covers: getting the Medusa backend + Postgres + Redis stack actually running and reachable on GCP for the first time, with backups proven to work — not the full production topology.

Repo currently has zero deployment artifacts: no Dockerfile, no prod compose file, no `.env.production`. `docker-compose.dev.yml` only runs Postgres+Redis locally (backend runs via `medusa develop` on the host). This plan builds what's missing.

## 1. GCP resources

- **Static external IP**: reserve one (`eshor-backend-ip`) so it survives VM restarts even before a domain exists — useful for webhook testing later.
- **VM**: `eshor-backend`, zone `us-central1-a` (same zone as `portfolio-vm`), machine type `e2-standard-2`, Debian 12 boot disk (30GB), the reserved static IP, default Compute Engine service account with default scopes (includes GCS read/write — no separate key file needed).
- **Firewall rule**: new rule scoped to a network tag (`eshor-backend`) on this VM only — allow inbound tcp:9000 (Medusa) from 0.0.0.0/0. Deliberately a *new, narrowly-tagged* rule rather than editing the existing `portfolio-allow-web` rule (which serves other, unrelated VMs) or reusing its already-open port set. SSH already covered by the project's existing `default-allow-ssh` rule.
- **GCS bucket**: `eshor-backups` (or a globally-unique variant), with a lifecycle rule deleting objects after 60 days — nightly `pg_dump` destination. Grant the VM's default service account `roles/storage.objectAdmin` scoped to this bucket.
- Install Docker Engine + the Compose plugin on the VM (official Docker apt repo, matching how WSL dev already does it — no snap/reinstall surprises).

## 2. New repo artifacts

- **`apps/backend/Dockerfile`**: multi-stage — install deps, `medusa build`, slim runtime image running `medusa start`. Reuses the exact `build`/`start` scripts already in `apps/backend/package.json`; no new build logic invented.
- **`docker-compose.prod.yml`** (repo root, alongside the existing `docker-compose.dev.yml`, same naming convention): `postgres`, `redis`, `backend` (built from the new Dockerfile) services. Only `backend`'s port 9000 is published to the host — postgres/redis stay on the internal compose network only, one step ahead of the eventual Caddy-fronted setup (matches gotcha G-I5's "compose services bind to localhost" principle even before Caddy exists). All three get `restart: unless-stopped` so the stack survives a VM reboot.
- **`apps/backend/.env.production`**: created directly on the VM via SSH, never committed (already covered by the existing `.env.*` gitignore pattern). Fresh `JWT_SECRET`/`COOKIE_SECRET` via `openssl rand -hex 32` — never reused from `.env.test`/dev. `DATABASE_URL`/`REDIS_URL` point at the compose service names (`postgres`, `redis`), not localhost. `STORE_CORS`/`ADMIN_CORS`/`AUTH_CORS` set permissively for now (IP-based, no real frontend origin yet) with a comment flagging they need tightening once the storefront has a real Vercel URL. `PAYSTACK_SECRET_KEY` reuses the same test key already in local dev — switching to a live key is a separate business decision, out of scope here. `APP_ENV=production`.
- **`scripts/gcp-backup.sh`**: adapts the exact `pg_dump` invocation already proven in `scripts/restore-drill.sh` (`--no-owner`, deliberately *not* `--no-privileges` — that flag once silently broke the `eshor_app` role's grants, per that script's own comment) to run inside the deployed postgres container, gzip the dump, and `gcloud storage cp` it to the new bucket. Installed as a nightly cron on the VM.

## 3. Deploy sequence

1. Provision the static IP, VM, firewall rule, and GCS bucket (`gcloud compute` / `gcloud storage` commands).
2. SSH in, install Docker.
3. Add a read-only SSH deploy key for the private `Hollowmuh/eshor` repo (`gh repo deploy-key add`) so the VM can `git clone` without a personal token; clone the repo.
4. Write `.env.production` on the VM (fresh secrets, per above).
5. `docker compose -f docker-compose.prod.yml up -d --build`.
6. Run migrations once against the running stack: `pnpm --filter @eshor/kernel migrate` then `medusa db:migrate` (same order as local onboarding, per README) — as one-off `docker compose exec`/`run` invocations.
7. Create the admin user + publishable key, then run the existing seed scripts (`seed-demo.ts`, `seed-delivery-zones.ts`, `seed-delivery-fulfillment.ts`, `link-paystack-to-region.ts`) inside the container — identical scripts already used for local dev, just pointed at the deployed stack.
8. Install the nightly backup cron; run it once by hand and do a restore-drill-style check (adapt `scripts/restore-drill.sh`'s verification steps — product count + `eshor_core` table count + `eshor_app` grants survive) to prove the backup is real, not a rumor.

## Verification

1. `curl http://<static-ip>:9000/health` → 200.
2. `curl http://<static-ip>:9000/store/products` with the publishable key → real seeded catalog (12 products, matches local).
3. Reboot the VM (`gcloud compute instances reset`), confirm the stack comes back up on its own (`restart: unless-stopped` + Docker starting on boot) without manual intervention.
4. Run the backup script once, confirm the object lands in the GCS bucket, then do one manual restore-drill against the deployed Postgres proving real data survives (not just "the command exited 0").

## Explicitly deferred (not part of this pass)

Domain purchase + Caddy/TLS + Cloudflare fronting; imgproxy; storefront deployment to Vercel + wiring `NEXT_PUBLIC_MEDUSA_BACKEND_URL` to this VM; a second (staging) VM; switching `PAYSTACK_SECRET_KEY` to a live key. Each is a real next step once a domain is bought, but none block proving the backend itself runs on GCP.

## Cost note

`e2-standard-2` runs roughly $50-60/mo in `us-central1` if left running continuously, plus a few cents/mo for the static IP and negligible GCS storage for backups. `portfolio-vm` is currently stopped (not billing compute) — worth stopping `eshor-backend` too between test sessions (`gcloud compute instances stop eshor-backend`) rather than leaving it running 24/7 during this smoke-test phase, unless you want it always reachable.