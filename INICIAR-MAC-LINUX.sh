#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Instala Node.js LTS desde https://nodejs.org y vuelve a abrir este archivo."
  exit 1
fi
exec node scripts/start.mjs
