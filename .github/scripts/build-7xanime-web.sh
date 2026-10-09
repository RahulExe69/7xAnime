#!/usr/bin/env bash
set -euo pipefail

PROXY_ROUTE="src/app/api/proxy"
PROXY_BACKUP=".7xanime-build-proxy"
HEALTH_ROUTE="src/app/api/health"
HEALTH_BACKUP=".7xanime-build-health"
RESTORED=0

restore_routes() {
  if [[ "$RESTORED" -eq 1 ]]; then
    return
  fi

  if [[ -d "$PROXY_BACKUP" ]]; then
    rm -rf "$PROXY_ROUTE"
    mkdir -p "$(dirname "$PROXY_ROUTE")"
    mv "$PROXY_BACKUP" "$PROXY_ROUTE"
  fi

  if [[ -d "$HEALTH_BACKUP" ]]; then
    rm -rf "$HEALTH_ROUTE"
    mkdir -p "$(dirname "$HEALTH_ROUTE")"
    mv "$HEALTH_BACKUP" "$HEALTH_ROUTE"
  fi

  RESTORED=1
}

trap restore_routes EXIT INT TERM

rm -rf out

if [[ -d "$PROXY_ROUTE" ]]; then
  rm -rf "$PROXY_BACKUP"
  mv "$PROXY_ROUTE" "$PROXY_BACKUP"
fi

if [[ -d "$HEALTH_ROUTE" ]]; then
  rm -rf "$HEALTH_BACKUP"
  mv "$HEALTH_ROUTE" "$HEALTH_BACKUP"
fi

NEXT_STATIC_EXPORT=1 npm run build

test -f out/index.html || {
  echo "::error::Next.js static export did not produce out/index.html."
  exit 1
}

echo "Static 7xAnime web bundle created in out/."
