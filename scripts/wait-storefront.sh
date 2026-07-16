#!/usr/bin/env bash
for i in $(seq 1 60); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 2 "http://localhost:8000/ng" 2>/dev/null)
  if [ "$code" = "200" ] || [ "$code" = "307" ] || [ "$code" = "308" ]; then
    echo "OK ($code) after ${i}s"
    exit 0
  fi
  sleep 1
done
echo "TIMEOUT (last code: $code)"
tail -60 /tmp/storefront-boot.log
exit 1
