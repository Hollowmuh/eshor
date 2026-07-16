#!/usr/bin/env bash
# Prove the CI gates are failing-capable (P0 exit criterion 5).
# Runs the money-lint rule against a known-bad fixture and asserts eslint
# exits nonzero; then asserts the clean tree passes.
set -u
cd "$(dirname "$0")/.."

FIXTURE=packages/kernel/src/__gate_violation__.ts
cat > "$FIXTURE" <<'EOF'
const totalPrice = 5000;
const discounted = totalPrice / 2;
const fee = parseFloat("12.5");
const vatAmount = totalPrice * 0.075;
export { discounted, fee, vatAmount };
EOF

pnpm exec eslint "$FIXTURE" > /dev/null 2>&1
violation_code=$?
rm -f "$FIXTURE"

if [ "$violation_code" -eq 0 ]; then
  echo "FAIL: money-lint did not reject the violation fixture"
  exit 1
fi
echo "OK: money-lint rejects violations (exit $violation_code)"

pnpm exec eslint . > /dev/null 2>&1
clean_code=$?
if [ "$clean_code" -ne 0 ]; then
  echo "FAIL: clean tree does not pass lint (exit $clean_code)"
  exit 1
fi
echo "OK: clean tree passes lint"
echo "GATES-PROVEN"
