#!/usr/bin/env bash
# P0 day 10 restore drill (hardening §5 / gotcha G-I5: "an untested
# backup is a rumor"). Dumps the live compose Postgres, drops and
# recreates the database, restores from the dump, then proves the
# restore actually holds real application data -- not just "psql didn't
# error" -- by re-querying the seeded catalog through the live Medusa
# store API.
set -euo pipefail

DUMP_FILE="/tmp/eshor-restore-drill-$(date +%s).sql"
CONTAINER=eshor-dev-postgres-1
DB=eshor
USER=eshor
PK=pk_ab5ed2caf47a15d4e41a55f7735fad36f9a69b33cb9eefb3e77f7b7a322f7d0e

echo "== 1. pre-drill sanity: count products via live API =="
BEFORE_COUNT=$(curl -fsS "http://localhost:9000/store/products?limit=1" \
  -H "x-publishable-api-key: $PK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).count))")
echo "products before drill: $BEFORE_COUNT"
if [ "$BEFORE_COUNT" -lt 1 ]; then
  echo "FAIL: no products found before drill -- nothing meaningful to restore"
  exit 1
fi

echo "== 2. dump =="
docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DB" --no-owner --no-privileges > "$DUMP_FILE"
DUMP_SIZE=$(wc -c < "$DUMP_FILE")
echo "dump written: $DUMP_FILE ($DUMP_SIZE bytes)"
if [ "$DUMP_SIZE" -lt 10000 ]; then
  echo "FAIL: dump suspiciously small -- refusing to proceed with drop"
  exit 1
fi

echo "== 3. stop backend (holds connections open) =="
pkill -f 'medusa develop' 2>/dev/null || true
sleep 2

echo "== 4. drop + recreate database =="
docker exec "$CONTAINER" psql -U "$USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB' AND pid <> pg_backend_pid();" > /dev/null
docker exec "$CONTAINER" dropdb -U "$USER" "$DB"
docker exec "$CONTAINER" createdb -U "$USER" -O "$USER" "$DB"

echo "== 5. restore =="
docker exec -i "$CONTAINER" psql -U "$USER" -d "$DB" < "$DUMP_FILE" > /tmp/restore-drill-psql.log 2>&1
RESTORE_EXIT=$?
if [ "$RESTORE_EXIT" -ne 0 ]; then
  echo "FAIL: psql restore exited $RESTORE_EXIT -- see /tmp/restore-drill-psql.log"
  exit 1
fi
echo "restore completed (see /tmp/restore-drill-psql.log for any non-fatal notices)"

echo "== 6. reboot backend =="
cd ~/dev/eshor/apps/backend
nohup npx medusa develop > /tmp/medusa-restore-drill.log 2>&1 &
disown

for i in $(seq 1 60); do
  if curl -fsS -m 2 http://localhost:9000/health > /dev/null 2>&1; then
    echo "backend healthy after restore, ${i}s"
    break
  fi
  sleep 1
done

echo "== 7. post-drill verification: real product data survived =="
AFTER_COUNT=$(curl -fsS "http://localhost:9000/store/products?limit=1" \
  -H "x-publishable-api-key: $PK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).count))")
echo "products after drill: $AFTER_COUNT"

AJA_FIT=$(curl -fsS "http://localhost:9000/store/products?handle=aja-dress" \
  -H "x-publishable-api-key: $PK" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.products[0]?j.products[0].id:'MISSING')})")
echo "aja-dress product id after restore: $AJA_FIT"

if [ "$AFTER_COUNT" != "$BEFORE_COUNT" ]; then
  echo "FAIL: product count mismatch before=$BEFORE_COUNT after=$AFTER_COUNT"
  exit 1
fi
if [ "$AJA_FIT" = "MISSING" ]; then
  echo "FAIL: aja-dress product missing after restore"
  exit 1
fi

# Also prove the eshor_core spine schema (outbox/ledger/etc) survived --
# it's a separate schema from Medusa's own tables, easy to silently drop.
SPINE_TABLES=$(docker exec "$CONTAINER" psql -U "$USER" -d "$DB" -tAc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'eshor_core'")
echo "eshor_core tables after restore: $SPINE_TABLES"
if [ "$SPINE_TABLES" -lt 5 ]; then
  echo "FAIL: eshor_core spine schema did not survive the restore (expected >=5 tables)"
  exit 1
fi

echo "RESTORE-DRILL-OK: dump=$DUMP_SIZE bytes, products=$AFTER_COUNT, spine_tables=$SPINE_TABLES"
