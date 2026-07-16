#!/usr/bin/env bash
# P0 day 1: graft the create-medusa-app scaffold into the eshor monorepo,
# adapt it to pnpm workspaces, boot Medusa against compose Postgres.
set -euo pipefail

cd ~/dev

echo "== graft =="
mkdir -p eshor/apps/backend eshor/apps/storefront
rsync -a --exclude node_modules --exclude .next medusa-tmp/apps/backend/ eshor/apps/backend/
rsync -a --exclude node_modules --exclude .next medusa-tmp/apps/storefront/ eshor/apps/storefront/

cd ~/dev/eshor

echo "== rename packages =="
sed -i 's/"name": "@dtc\/backend"/"name": "@eshor\/backend"/' apps/backend/package.json
sed -i 's/"name": "@dtc\/storefront"/"name": "@eshor\/storefront"/' apps/storefront/package.json

echo "== backend env =="
cat > apps/backend/.env <<'EOF'
APP_ENV=development
DATABASE_URL=postgres://eshor:eshor_dev@localhost:5432/eshor
REDIS_URL=redis://localhost:6379
STORE_CORS=http://localhost:8000
ADMIN_CORS=http://localhost:9000,http://localhost:5173
AUTH_CORS=http://localhost:8000,http://localhost:9000
JWT_SECRET=dev_jwt_secret_change_me
COOKIE_SECRET=dev_cookie_secret_change_me
EOF

echo "== env template (committed; .env is gitignored) =="
sed 's/=.*/=/' apps/backend/.env | sed 's/^APP_ENV=$/APP_ENV=development/' > apps/backend/.env.template

echo "== storefront env: NG defaults =="
sed -i 's/NEXT_PUBLIC_DEFAULT_REGION=dk/NEXT_PUBLIC_DEFAULT_REGION=ng/' apps/storefront/.env.local

echo "== install workspace =="
pnpm install 2>&1 | tail -3

echo "== migrate =="
cd apps/backend
npx medusa db:migrate 2>&1 | tail -5

echo "== boot check: medusa develop, wait for :9000/health =="
(npx medusa develop > /tmp/medusa-boot.log 2>&1 &)
for i in $(seq 1 60); do
  if curl -fsS http://localhost:9000/health > /dev/null 2>&1; then
    echo "MEDUSA-HEALTH-OK after ${i}s"
    break
  fi
  sleep 1
done
curl -fsS http://localhost:9000/health && echo "" || { echo "MEDUSA-BOOT-FAILED"; tail -30 /tmp/medusa-boot.log; exit 1; }
