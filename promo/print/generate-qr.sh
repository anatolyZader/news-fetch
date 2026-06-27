#!/usr/bin/env bash
# Generate the srulik.ai QR code for poster + business card.
# This is a Node repo — use the Node toolchain. Run when you have network access.
#
#   ./generate-qr.sh                # -> qr-srulik-ai.svg + qr-srulik-ai.png
#
# Requires network the first time (npx downloads the `qrcode` CLI).
set -euo pipefail
cd "$(dirname "$0")"

URL="https://srulik.ai"

# High error-correction (-e H) survives a printed logo/overlay; -m 4 quiet zone.
npx --yes qrcode -e H -m 4 -t svg  -o qr-srulik-ai.svg "$URL"
npx --yes qrcode -e H -m 4 -t png  -o qr-srulik-ai.png "$URL" -w 1024

echo "Wrote qr-srulik-ai.svg and qr-srulik-ai.png for $URL"
echo "Test-scan the PNG before sending anything to print."
