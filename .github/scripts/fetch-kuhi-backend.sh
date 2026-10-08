#!/usr/bin/env bash
set -euo pipefail

# Pinned to avoid silently changing the API bundled into a debug APK.
KUHI_REPOSITORY="https://github.com/aryaniiil/anime-api.git"
KUHI_COMMIT="d9a785ad030d6fc6a8ad709291be9612c864449e"
SOURCE_DIR="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/7xanime-kuhi"

rm -rf "${SOURCE_DIR}"
git clone --filter=blob:none --no-checkout "${KUHI_REPOSITORY}" "${SOURCE_DIR}"
git -C "${SOURCE_DIR}" fetch --depth=1 origin "${KUHI_COMMIT}"
git -C "${SOURCE_DIR}" checkout --detach "${KUHI_COMMIT}"

test -f "${SOURCE_DIR}/src/main.py" || {
  echo "::error::Pinned Kuhi snapshot is missing src/main.py."
  exit 1
}
test -f "${SOURCE_DIR}/src/endpoints.py" || {
  echo "::error::Pinned Kuhi snapshot is missing src/endpoints.py."
  exit 1
}

if [[ -n "${GITHUB_ENV:-}" ]]; then
  echo "KUHI_SOURCE_DIR=${SOURCE_DIR}" >> "${GITHUB_ENV}"
fi

echo "Prepared Kuhi backend at ${KUHI_COMMIT}."
