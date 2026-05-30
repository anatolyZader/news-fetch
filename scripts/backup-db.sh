#!/usr/bin/env bash
# Backup SQLite database and evidence uploads for disaster recovery drills.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB_PATH="${SQLITE_PATH:-$ROOT/db/app.sqlite}"
UPLOADS_DIR="${EVIDENCE_UPLOADS_ROOT:-$ROOT/db/evidence-uploads}"
OUT_DIR="${1:-$ROOT/db/backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$OUT_DIR/backup-$STAMP.tar.gz"

mkdir -p "$OUT_DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

if [[ ! -f "$DB_PATH" ]]; then
  echo "SQLite not found: $DB_PATH" >&2
  exit 1
fi

sqlite3 "$DB_PATH" ".backup '$TMP/app.sqlite'"
mkdir -p "$TMP/evidence-uploads"
if [[ -d "$UPLOADS_DIR" ]]; then
  cp -a "$UPLOADS_DIR/." "$TMP/evidence-uploads/"
fi

tar -czf "$ARCHIVE" -C "$TMP" app.sqlite evidence-uploads
echo "Wrote $ARCHIVE"
