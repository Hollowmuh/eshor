#!/usr/bin/env bash
set -euo pipefail
BASE=http://localhost:9000

TOKEN=$(curl -fsS -X POST "$BASE/auth/user/emailpass" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@eshor.dev","password":"DevAdmin_ChangeMe1"}' \
  | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token))")

echo "--- by handle ---"
curl -fsS "$BASE/admin/products?handle=publish-guard-proof&fields=id,handle,status" \
  -H "Authorization: Bearer $TOKEN"
echo
echo "--- all statuses, no field filter, raw count ---"
curl -fsS "$BASE/admin/products?limit=1" -H "Authorization: Bearer $TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('count field:', j.count)})"
