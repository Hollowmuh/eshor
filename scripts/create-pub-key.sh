#!/usr/bin/env bash
set -euo pipefail
BASE=http://localhost:9000

TOKEN=$(curl -fsS -X POST "$BASE/auth/user/emailpass" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@eshor.dev","password":"DevAdmin_ChangeMe1"}' \
  | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token))")

if [ -z "$TOKEN" ]; then
  echo "FAILED: no auth token"
  exit 1
fi

KEY_JSON=$(curl -fsS -X POST "$BASE/admin/api-keys" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"eshor-dev-storefront","type":"publishable"}')

KEY_ID=$(echo "$KEY_JSON" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).api_key.id))")

# Newly created keys are inactive until revoked/... actually they need a sales channel link
# to resolve region/product scoping; fetch the default sales channel and link it.
SC_JSON=$(curl -fsS "$BASE/admin/sales-channels" -H "Authorization: Bearer $TOKEN")
SC_ID=$(echo "$SC_JSON" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).sales_channels[0].id))")

curl -fsS -X POST "$BASE/admin/api-keys/$KEY_ID/sales-channels" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"add\":[\"$SC_ID\"]}" > /dev/null

echo "$KEY_JSON" | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).api_key.token))"
