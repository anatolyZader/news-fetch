#!/usr/bin/env bash
# Open the HQ brochure HTML in the default browser (preview before PDF export).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
FILE="$ROOT/brochure-hq-en.html"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "file://$FILE"
elif command -v open >/dev/null 2>&1; then
  open "$FILE"
else
  echo "Open in browser: file://$FILE"
fi
