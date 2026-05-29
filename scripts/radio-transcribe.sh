#!/usr/bin/env bash
#
# Transcribe radio recordings that don't have a corresponding .md transcript yet.
#
# Usage:
#   ./scripts/radio-transcribe.sh              # today only
#   ./scripts/radio-transcribe.sh 3            # last 3 days
#   ./scripts/radio-transcribe.sh 2026-04-08   # specific date
#
set -euo pipefail
cd "$(dirname "$0")/.."

RECORDINGS_DIR="${RECORDINGS_DIR:-business_modules/recording/data}"

# ── Resolve dates ──────────────────────────────────────────────────────────
resolve_dates() {
  if [[ $# -eq 0 ]]; then
    date -u -d "TZ=\"Asia/Jerusalem\"" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d
  elif [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
    echo "$1"
  elif [[ "$1" =~ ^[0-9]+$ ]]; then
    for ((i=0; i<$1; i++)); do
      date -d "today - ${i} days" +%Y-%m-%d
    done
  else
    echo "Usage: $0 [DAYS|YYYY-MM-DD]" >&2; exit 1
  fi
}

DATES=$(resolve_dates "${1:-}")

# ── Station → program name + language map (from recording jobs DB) ─────────
# We parse the job list once to build a lookup. Format: station|program-slug → program|language
declare -A JOB_PROGRAMS
declare -A JOB_LANGUAGES

while IFS= read -r line; do
  if [[ "$line" =~ Station[[:space:]]*:[[:space:]]*(.+) ]]; then
    current_station="${BASH_REMATCH[1]}"
    current_station=$(echo "$current_station" | xargs)  # trim
  fi
  if [[ "$line" =~ Program[[:space:]]*:[[:space:]]*(.+) ]]; then
    current_program="${BASH_REMATCH[1]}"
    current_program=$(echo "$current_program" | xargs)
  fi
  if [[ "$line" =~ Language[[:space:]]*:[[:space:]]*(.+) ]]; then
    current_language="${BASH_REMATCH[1]}"
    current_language=$(echo "$current_language" | xargs)
  fi
  # On each blank or new job block, save what we have
  if [[ "$line" =~ ^$ || "$line" =~ ^\[ON\] || "$line" =~ ^\[OFF\] ]]; then
    if [[ -n "${current_station:-}" && -n "${current_program:-}" ]]; then
      # Slugify the program name for matching against directory names
      slug=$(echo "$current_program" | sed 's/ /-/g; s/:/-/g')
      JOB_PROGRAMS["${current_station}|${slug}"]="$current_program"
      JOB_LANGUAGES["${current_station}|${slug}"]="${current_language:-he}"
    fi
    if [[ "$line" =~ ^\[ON\] || "$line" =~ ^\[OFF\] ]]; then
      current_station="" ; current_program="" ; current_language=""
    fi
  fi
done < <(node business_modules/recording/input/manage-jobs.js list 2>/dev/null; echo "")
# Flush last entry
if [[ -n "${current_station:-}" && -n "${current_program:-}" ]]; then
  slug=$(echo "$current_program" | sed 's/ /-/g; s/:/-/g')
  JOB_PROGRAMS["${current_station}|${slug}"]="$current_program"
  JOB_LANGUAGES["${current_station}|${slug}"]="${current_language:-he}"
fi

# ── Find and match program name for a recording path ───────────────────────
find_program() {
  local station="$1" program_slug="$2"
  # Try exact match first
  for key in "${!JOB_PROGRAMS[@]}"; do
    local key_station="${key%%|*}"
    local key_slug="${key##*|}"
    if [[ "$key_station" == "$station" ]]; then
      # Check if the directory slug contains the job slug or vice versa
      if [[ "$program_slug" == *"$key_slug"* || "$key_slug" == *"$program_slug"* ]]; then
        echo "${JOB_PROGRAMS[$key]}"
        return 0
      fi
    fi
  done
  # Fallback: use the slug with dashes replaced by spaces
  echo "${program_slug//-/ }"
}

find_language() {
  local station="$1" program_slug="$2"
  for key in "${!JOB_LANGUAGES[@]}"; do
    local key_station="${key%%|*}"
    local key_slug="${key##*|}"
    if [[ "$key_station" == "$station" ]]; then
      if [[ "$program_slug" == *"$key_slug"* || "$key_slug" == *"$program_slug"* ]]; then
        echo "${JOB_LANGUAGES[$key]}"
        return 0
      fi
    fi
  done
  echo "he"
}

# ── Main loop ──────────────────────────────────────────────────────────────
found=0; skipped=0; transcribed=0; failed=0
created_files=()

for dt in $DATES; do
  echo "── $dt ──"
  while IFS= read -r mp3; do
    [[ -z "$mp3" ]] && continue
    ((found++))

    # Parse path: {RECORDINGS_DIR}/{station}/{date}/{program-slug}/{uuid}/recording.mp3
    rel="${mp3#*${RECORDINGS_DIR}/}"
    station="${rel%%/*}"
    program_slug=$(echo "$rel" | cut -d/ -f3)

    # Extract start time from slug (last pair of NN-NN before the end time)
    # e.g. "משדרי-הבוקר-אשמס-09-00-11-00" → "09-00"
    start_time=$(echo "$program_slug" | grep -oP '\d{2}-\d{2}(?=-\d{2}-\d{2}$)' || echo "00-00")

    out_file="articles-audio-${station}-${dt}T${start_time}.md"

    if [[ -f "$out_file" ]]; then
      echo "  SKIP  $station $program_slug (already transcribed: $out_file)"
      ((skipped++))
      continue
    fi

    program=$(find_program "$station" "$program_slug")
    language=$(find_language "$station" "$program_slug")

    whisper_flag=""
    if [[ "$language" != "he" ]]; then
      whisper_flag="--whisper"
    fi

    echo "  TRANSCRIBE  $station | $program | → $out_file"
    if node business_modules/audio/input/audio-to-md.js \
        --input "$mp3" \
        --date "$dt" \
        --station "$station" \
        --program "$program" \
        --out "$out_file" \
        --contextualize \
        $whisper_flag; then
      ((transcribed++))
      created_files+=("$out_file")
    else
      echo "  FAILED  $station $program_slug"
      ((failed++))
    fi

  done < <(find "${RECORDINGS_DIR}"/*/"$dt" -name "recording.mp3" 2>/dev/null || true)
done

# ── Summary ────────────────────────────────────────────────────────────────
echo ""
echo "═══ Summary ═══"
echo "  Found:        $found recordings"
echo "  Skipped:      $skipped (already transcribed)"
echo "  Transcribed:  $transcribed"
[[ $failed -gt 0 ]] && echo "  Failed:       $failed"
if [[ ${#created_files[@]} -gt 0 ]]; then
  echo ""
  echo "  Created files:"
  for f in "${created_files[@]}"; do echo "    $f"; done
fi
