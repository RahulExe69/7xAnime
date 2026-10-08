#!/bin/sh
set -eu

PB_DIR=/pb_data
: "${PB_ADMIN_EMAIL:?Set PB_ADMIN_EMAIL in .env.backend}"
: "${PB_ADMIN_PASSWORD:?Set PB_ADMIN_PASSWORD in .env.backend}"

mkdir -p "$PB_DIR"

# This is a local-development bootstrap. Use a unique password and never expose
# the admin UI publicly with development credentials.
pocketbase --dir="$PB_DIR" superuser create "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" >/dev/null 2>&1 || true

pocketbase --dir="$PB_DIR" serve --http=0.0.0.0:8090 &
PB_PID=$!
trap 'kill "$PB_PID" 2>/dev/null; wait "$PB_PID"' INT TERM

ready=0
for _ in $(seq 1 30); do
  if wget -q -O /dev/null http://127.0.0.1:8090/api/health; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "[pocketbase] Health check timed out" >&2
  exit 1
fi

python3 /usr/local/bin/init-collections.py
wait "$PB_PID"
