#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "repair:native is only needed on macOS; skipping."
  exit 0
fi

if ! command -v codesign >/dev/null 2>&1; then
  echo "codesign not found; cannot repair native bindings." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "node_modules not found; run npm install first." >&2
  exit 1
fi

native_bindings=()
while IFS= read -r binding; do
  native_bindings+=("$binding")
done < <(
  find node_modules \
    \( -path '*/@rollup/*/*.node' -o -path '*/@rolldown/*/*.node' \) \
    -type f \
    -print
)

if [[ "${#native_bindings[@]}" -eq 0 ]]; then
  echo "No Rollup/Rolldown native bindings found."
  exit 0
fi

for binding in "${native_bindings[@]}"; do
  codesign --force --sign - "$binding" >/dev/null
  echo "signed $binding"
done
