#!/usr/bin/env bash
#
# Daily resilience pipeline — transcribe + extract signals + assess.
# Equivalent to /8comp-3 but runs without Claude Code.
#
# Usage:
#   ./scripts/daily-pipeline.sh           # full pipeline (transcribe + signals + assess)
#   ./scripts/daily-pipeline.sh --no-transcribe   # skip transcription step
#
set -euo pipefail
cd "$(dirname "$0")/.."

SKIP_TRANSCRIBE=false
[[ "${1:-}" == "--no-transcribe" ]] && SKIP_TRANSCRIBE=true

# ── Dates ──────────────────────────────────────────────────────────────────
TODAY=$(date +%Y-%m-%d)
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
TWO_DAYS_AGO=$(date -d "2 days ago" +%Y-%m-%d)
DATES=("$TODAY" "$YESTERDAY" "$TWO_DAYS_AGO")

echo "═══ Daily Resilience Pipeline ═══"
echo "  Dates: ${DATES[*]}"
echo "  Started: $(date)"
echo ""

# ── Step 1: Transcribe missing recordings (last 3 days) ───────────────────
if [[ "$SKIP_TRANSCRIBE" == false ]]; then
  echo "── Step 1: Transcribe missing recordings ──"
  bash scripts/radio-transcribe.sh 3
  echo ""
else
  echo "── Step 1: Transcription skipped (--no-transcribe) ──"
  echo ""
fi

# ── Step 2: Fetch news for each day ───────────────────────────────────────
echo "── Step 2: Fetch news articles ──"
for dt in "${DATES[@]}"; do
  echo "  Fetching news for $dt..."
  npm run homefront-to-md -- "$dt" || echo "  WARNING: news fetch failed for $dt"
done
echo ""

# ── Step 3: Extract news signals ──────────────────────────────────────────
echo "── Step 3: Extract news signals ──"
for dt in "${DATES[@]}"; do
  news_file="articles-homefront-${dt}.md"
  if [[ -f "$news_file" && -s "$news_file" ]]; then
    echo "  Extracting signals from $news_file..."
    node business_modules/resilience/input/extract-signals.js \
      --source-type news --files "$news_file" --date "$dt" \
      || echo "  WARNING: news signal extraction failed for $dt"
  else
    echo "  SKIP $dt (no news file)"
  fi
done
echo ""

# ── Step 4: Extract radio signals ─────────────────────────────────────────
echo "── Step 4: Extract radio signals ──"
for dt in "${DATES[@]}"; do
  radio_files=$(ls articles-audio-*-"${dt}"T*.md 2>/dev/null | tr '\n' ',' | sed 's/,$//')
  if [[ -n "$radio_files" ]]; then
    echo "  Extracting signals from radio transcripts for $dt..."
    node business_modules/resilience/input/extract-signals.js \
      --source-type radio --files "$radio_files" --date "$dt" \
      || echo "  WARNING: radio signal extraction failed for $dt"
  else
    echo "  SKIP $dt (no radio transcripts)"
  fi
done
echo ""

# ── Step 5: Export WhatsApp and extract signals ───────────────────────────
echo "── Step 5: WhatsApp signals ──"
for dt in "${DATES[@]}"; do
  node business_modules/whatsapp/input/whatsapp-to-md.js --date "$dt" 2>/dev/null || true
  wa_file="articles-whatsapp-${dt}.md"
  if [[ -f "$wa_file" && -s "$wa_file" ]]; then
    echo "  Extracting signals from $wa_file..."
    node business_modules/resilience/input/extract-signals.js \
      --source-type whatsapp --files "$wa_file" --date "$dt" \
      || echo "  WARNING: whatsapp signal extraction failed for $dt"
  else
    echo "  SKIP $dt (no WhatsApp messages)"
  fi
done
echo ""

# ── Step 6: Extract field report signals (last 3 available files) ─────────
echo "── Step 6: Field report signals ──"
field_files=$(ls articles-field-reports-*.md 2>/dev/null | sort | tail -3)
if [[ -n "$field_files" ]]; then
  for ff in $field_files; do
    field_date=$(echo "$ff" | grep -oP '\d{4}-\d{2}-\d{2}')
    echo "  Extracting signals from $ff (date: $field_date)..."
    node business_modules/resilience/input/extract-signals.js \
      --source-type field --files "$ff" --date "$field_date" \
      || echo "  WARNING: field signal extraction failed for $ff"
  done
else
  echo "  SKIP (no field report files)"
fi
echo ""

# ── Step 7: Extract PBO municipality signals ──────────────────────────────
echo "── Step 7: PBO municipality signals ──"
node business_modules/pbo_report_muni/input/extract-pbo-signals.js 2>/dev/null \
  && echo "  Done" \
  || echo "  SKIP (no PBO files or extraction failed)"
echo ""

# ── Step 8: Extract Naftali questionnaire signals ─────────────────────────
echo "── Step 8: Naftali questionnaire signals ──"
node business_modules/naftali/input/extract-naftali-signals.js 2>/dev/null \
  && echo "  Done" \
  || echo "  SKIP (no Naftali files or extraction failed)"
echo ""

# ── Step 9: Run combined 3-day assessment ─────────────────────────────────
echo "── Step 9: Run 3-day resilience assessment ──"
node business_modules/resilience/input/assess-signals.js --date "$TODAY" --days 3
echo ""

echo "═══ Pipeline Complete ═══"
echo "  Finished: $(date)"
