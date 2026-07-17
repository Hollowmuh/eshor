#!/usr/bin/env bash
# P0 day 10 synthetic check (hardening §4.3): the same curl probe that
# staging/prod run on a 5-minute cadence once deployed. Checks the
# backend health endpoint, storefront home, PLP, and one real PDP --
# fails loudly (non-zero exit, printed diagnosis) on any red signal
# rather than silently passing on a 200 that hides broken content.
set -uo pipefail

BACKEND_URL="${BACKEND_URL:-http://localhost:9000}"
STOREFRONT_URL="${STOREFRONT_URL:-http://localhost:8000}"
COUNTRY="${COUNTRY:-ng}"
FAILURES=0

check() {
  local name="$1" url="$2" expect_code="$3" expect_grep="${4:-}"
  local body
  local code
  body=$(curl -sS -m 10 -o /tmp/synthetic-check-body.$$ -w '%{http_code}' "$url" 2>/tmp/synthetic-check-err.$$)
  code="$body"
  if [ "$code" != "$expect_code" ]; then
    echo "FAIL [$name] expected HTTP $expect_code, got $code -- $url"
    echo "      curl stderr: $(cat /tmp/synthetic-check-err.$$ 2>/dev/null)"
    FAILURES=$((FAILURES + 1))
    rm -f /tmp/synthetic-check-body.$$ /tmp/synthetic-check-err.$$
    return
  fi
  if [ -n "$expect_grep" ] && ! grep -q "$expect_grep" /tmp/synthetic-check-body.$$; then
    echo "FAIL [$name] HTTP $code OK but body missing expected content: \"$expect_grep\" -- $url"
    FAILURES=$((FAILURES + 1))
    rm -f /tmp/synthetic-check-body.$$ /tmp/synthetic-check-err.$$
    return
  fi
  echo "OK   [$name] $url ($code)"
  rm -f /tmp/synthetic-check-body.$$ /tmp/synthetic-check-err.$$
}

echo "== eshor synthetic check $(date -u +%FT%TZ) =="

check "backend health"    "$BACKEND_URL/health"                          "200"
check "storefront home"   "$STOREFRONT_URL/$COUNTRY"                     "200" "trust-strip"
check "storefront PLP"    "$STOREFRONT_URL/$COUNTRY/store"               "200" "products-list"
check "storefront PDP"    "$STOREFRONT_URL/$COUNTRY/products/aja-dress"  "200" "product-fit-panel"
check "PDP 404 handling"  "$STOREFRONT_URL/$COUNTRY/products/__does-not-exist__" "404"

echo "=============================================="
if [ "$FAILURES" -eq 0 ]; then
  echo "SYNTHETIC-CHECK-OK: all probes passed"
  exit 0
else
  echo "SYNTHETIC-CHECK-FAILED: $FAILURES probe(s) failed"
  exit 1
fi
