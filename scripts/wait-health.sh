#!/usr/bin/env bash
for i in $(seq 1 45); do
  if curl -fsS -m 2 http://localhost:9000/health > /dev/null 2>&1; then
    echo "OK after ${i}s"
    exit 0
  fi
  sleep 1
done
echo TIMEOUT
tail -40 /tmp/medusa-boot.log
exit 1
