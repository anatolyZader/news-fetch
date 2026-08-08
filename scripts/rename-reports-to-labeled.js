#!/usr/bin/env node
/**
 * One-shot rename: compact/legacy report basenames → labeled format.
 *
 * Old: {scope}-{days}-{DDMMYY}-{HHmm}    e.g. north-1-030426-0940
 * New: {scope}-{days}-data-{YYYY-MM-DD}-produced-{YYYY-MM-DD}T{HHmm}Z
 *
 * Usage:
 *   node scripts/rename-reports-to-labeled.js            # dry-run (default)
 *   node scripts/rename-reports-to-labeled.js --apply    # actually rename
 *
 * Rules:
 *   - Uses JSON `generated_at` field when present (most accurate).
 *   - Falls back to compact HHmm token + file mtime calendar date for MD-only.
 *   - Renames .json, .md, and -brief.md together as a group.
 *   - Skips already-labeled files and omission-audit / agent-audit artifacts.
 *   - Never overwrites an existing target.
 */

import { readFileSync, renameSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORTS_DIR = join(REPO_ROOT, 'business_modules/resilience_scorer/data/daily_reports');

const APPLY = process.argv.includes('--apply');

// ---------------------------------------------------------------------------
// Regex mirrors from reportNames.js (no import needed — script is standalone)
// ---------------------------------------------------------------------------
const LABELED_RE = /^([a-z]+)-(\d{1,2})-data-(\d{4}-\d{2}-\d{2})-produced-(\d{4}-\d{2}-\d{2}T\d{4}Z)$/;
const COMPACT_RE = /^([a-z]+)-(\d{1,2})-(\d{6})-(\d{4})$/;
const LEGACY_RE = /^resilience-report(?:-(north|south|jerusalem|dan|haifa))?-data-(\d{4}-\d{2}-\d{2})-run-([^.]+)$/;
const LEGACY_REGIONAL_SIMPLE_RUN_RE = /^resilience-report-(north|south|jerusalem|dan|haifa)-(\d{4}-\d{2}-\d{2})-(\d{4})$/;
const LEGACY_SIMPLE_RUN_RE = /^resilience-report-(\d{4}-\d{2}-\d{2})-(\d{4})$/;
const LEGACY_SIMPLE_DATE_RE = /^resilience-report-(\d{4}-\d{2}-\d{2})$/;
const SKIP_RE = /^(omission-audit|.*-agent-audit)/;

function ddmmyyToIso(t) {
  return `20${t.slice(4, 6)}-${t.slice(2, 4)}-${t.slice(0, 2)}`;
}

/** Parse any known basename, returning { reportDate, scopeId, days, hhmm, legacyRunId } or null. */
function parseStem(stem) {
  let m;
  if (LABELED_RE.test(stem)) return null; // already labeled, skip

  m = COMPACT_RE.exec(stem);
  if (m) return { scopeId: m[1], days: Number(m[2]), reportDate: ddmmyyToIso(m[3]), hhmm: m[4], legacyRunId: null };

  m = LEGACY_RE.exec(stem);
  if (m) return { scopeId: m[1] ?? 'national', days: 1, reportDate: m[2], hhmm: null, legacyRunId: m[3] };

  m = LEGACY_REGIONAL_SIMPLE_RUN_RE.exec(stem);
  if (m) return { scopeId: m[1], days: 1, reportDate: m[2], hhmm: m[3], legacyRunId: null };

  m = LEGACY_SIMPLE_RUN_RE.exec(stem);
  if (m) return { scopeId: 'national', days: 1, reportDate: m[1], hhmm: m[2], legacyRunId: null };

  m = LEGACY_SIMPLE_DATE_RE.exec(stem);
  if (m) return { scopeId: 'national', days: 1, reportDate: m[1], hhmm: '0000', legacyRunId: null };

  return null;
}

/** Build the labeled produce token from a full ISO string and a fallback HHmm. */
function makeProducedToken(generatedAtIso, hhmm, stemFilePath) {
  if (generatedAtIso) {
    // "2026-08-07T09:40:41.965Z" → "2026-08-07T0940Z"
    const d = new Date(generatedAtIso);
    if (!Number.isNaN(d.getTime())) {
      const pd = d.toISOString();
      return `${pd.slice(0, 10)}T${pd.slice(11, 13)}${pd.slice(14, 16)}Z`;
    }
  }
  // Fallback: file mtime date + HHmm from filename (HHmm assumed UTC)
  if (hhmm && hhmm !== '0000') {
    try {
      const mtime = new Date(statSync(stemFilePath).mtimeMs);
      const pd = mtime.toISOString();
      return `${pd.slice(0, 10)}T${hhmm.slice(0, 2)}${hhmm.slice(2, 4)}Z`;
    } catch { /* ignore */ }
  }
  return null;
}

/** Read generated_at from the JSON sidecar if it exists. */
function readGeneratedAt(jsonPath) {
  try {
    const raw = JSON.parse(readFileSync(jsonPath, 'utf8'));
    return raw?.generated_at ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const entries = readdirSync(REPORTS_DIR);

// Build set of all stems present so we can handle the triple (.json/.md/-brief.md)
const allStems = new Set();
for (const f of entries) {
  const stem = f.replace(/-brief\.md$/i, '').replace(/\.(json|md)$/i, '');
  allStems.add(stem);
}

const processed = new Set();
let renamed = 0;
let skipped = 0;
let errors = 0;

for (const stem of allStems) {
  if (processed.has(stem)) continue;
  processed.add(stem);

  if (SKIP_RE.test(stem)) continue;

  const parsed = parseStem(stem);
  if (!parsed) continue; // already labeled or unrecognized

  const { scopeId, days, reportDate, hhmm } = parsed;

  const jsonPath = join(REPORTS_DIR, `${stem}.json`);
  const mdPath = join(REPORTS_DIR, `${stem}.md`);
  const briefPath = join(REPORTS_DIR, `${stem}-brief.md`);

  const jsonExists = existsSync(jsonPath);
  const mdExists = existsSync(mdPath);
  const briefExists = existsSync(briefPath);

  if (!jsonExists && !mdExists) continue;

  const generatedAt = jsonExists ? readGeneratedAt(jsonPath) : null;
  const producedToken = makeProducedToken(generatedAt, hhmm, jsonExists ? jsonPath : mdPath);

  if (!producedToken) {
    console.error(`SKIP (no timestamp) ${stem}`);
    skipped++;
    continue;
  }

  const newStem = `${scopeId}-${days}-data-${reportDate}-produced-${producedToken}`;

  if (newStem === stem) { skipped++; continue; } // already labeled (shouldn't happen)

  const newJson = join(REPORTS_DIR, `${newStem}.json`);
  const newMd = join(REPORTS_DIR, `${newStem}.md`);
  const newBrief = join(REPORTS_DIR, `${newStem}-brief.md`);

  const ops = [];
  if (jsonExists) ops.push([jsonPath, newJson]);
  if (mdExists) ops.push([mdPath, newMd]);
  if (briefExists) ops.push([briefPath, newBrief]);

  const collides = ops.some(([, dest]) => existsSync(dest) && dest !== ops[0][0]);
  if (collides) {
    console.error(`SKIP (collision) ${stem} → ${newStem}`);
    skipped++;
    continue;
  }

  const arrow = `${stem} → ${newStem}`;
  if (!APPLY) {
    console.log(`[dry-run] ${arrow}`);
    renamed++;
    continue;
  }

  try {
    for (const [src, dest] of ops) {
      renameSync(src, dest);
    }
    console.log(`RENAMED  ${arrow}`);
    renamed++;
  } catch (err) {
    console.error(`ERROR    ${arrow}: ${err.message}`);
    errors++;
  }
}

console.log(`\n${APPLY ? 'Applied' : 'Dry-run'}: ${renamed} rename(s), ${skipped} skip(s), ${errors} error(s).`);
if (!APPLY && renamed > 0) {
  console.log('Re-run with --apply to rename on disk.');
}
