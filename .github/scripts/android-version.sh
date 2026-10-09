#!/usr/bin/env bash
set -euo pipefail

RAW_VERSION="${1:-}"
VERSION="${RAW_VERSION#v}"

if [[ ! "${VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: version must use MAJOR.MINOR.PATCH (for example 1.0.0)." >&2
  exit 1
fi

IFS="." read -r MAJOR MINOR PATCH <<< "${VERSION}"

if (( MINOR >= 1000 || PATCH >= 1000 )); then
  echo "ERROR: minor and patch versions must each be below 1000." >&2
  exit 1
fi

VERSION_CODE=$((MAJOR * 1000000 + MINOR * 1000 + PATCH))

if (( VERSION_CODE <= 0 || VERSION_CODE > 2100000000 )); then
  echo "ERROR: calculated Android versionCode ${VERSION_CODE} is outside the supported range." >&2
  exit 1
fi

echo "VERSION_NAME=${VERSION}"
echo "VERSION_CODE=${VERSION_CODE}"
