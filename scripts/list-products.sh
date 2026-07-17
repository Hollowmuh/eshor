#!/usr/bin/env bash
set -euo pipefail
BASE=http://localhost:9000

TOKEN=$(curl -fsS -X POST "$BASE/auth/user/emailpass" \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@eshor.dev","password":"DevAdmin_ChangeMe1"}' \
  | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token))")

curl -fsS "$BASE/admin/products?limit=100&fields=id,handle,status" \
  -H "Authorization: Bearer $TOKEN" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.count,'products');j.products.forEach(p=>console.log(p.status,p.handle,p.id))})"
