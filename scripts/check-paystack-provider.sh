#!/usr/bin/env bash
set -euo pipefail
BASE=http://localhost:9000

TOKEN=$(curl -fsS -X POST "$BASE/auth/user/emailpass" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@eshor.dev","password":"DevAdmin_ChangeMe1"}' \
  | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token))")

echo "--- all payment providers (system-wide) ---"
curl -fsS "$BASE/admin/payment-providers" -H "Authorization: Bearer $TOKEN"
echo
