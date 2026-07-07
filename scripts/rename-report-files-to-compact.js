#!/usr/bin/env node
/**
 * Rename legacy resilience report artifacts to compact basenames:
 *   {scope}-{days}-{DDMMYY}-{HHmm}[.json|.md|-brief.md]
 *
 * Usage:
 *   node scripts/rename-report-files-to-compact.js              # dry-run (default)
 *   node scripts/rename-report-files-to-compact.js --apply
 */
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseReportFilename,
  buildReportBasename,
  COMPACT_REPORT_BASENAME_RE,
} from '../business_modules/resilience_scorer/domain/services/reportArtifactNames.js';
import { resilienceReportsDir } from '../business_modules/resilience_scorer/domain/services/artifactPaths.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const reportsDir = resilienceReportsDir(REPO_ROOT);

/** @param {string} runId @param {string | null} generatedAt */
function normalizeLegacyIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  if (iso.includes(':')) return iso.endsWith('Z') ? iso : `${iso}Z`;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z?$/.exec(iso);
  if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`;
  return iso.endsWith('Z') ? iso : `${iso}Z`;
}

/** @param {string} runId @param {string | null} generatedAt */
function hhmmFromRunMeta(runId, generatedAt) {
  if (/^\d{4}$/.test(runId)) return runId;
  const iso = normalizeLegacyIso(runId.includes('T') ? runId : generatedAt);
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(11, 16).replace(':', '');
    }
  }
  return '0000';
}

/** @param {string} reportDate @param {string} hhmm @param {string | null} generatedAt */
function runAtForBasename(reportDate, hhmm, generatedAt) {
  const iso = normalizeLegacyIso(generatedAt);
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const [y, m, d] = reportDate.split('-').map((s) => Number.parseInt(s, 10));
  return new Date(Date.UTC(y, m - 1, d,
    Number.parseInt(hhmm.slice(0, 2), 10),
    Number.parseInt(hhmm.slice(2, 4), 10),
    0,
  ));
}

/**
 * @param {string} name
 * @returns {'json' | 'md' | 'brief' | null}
 */
function reportFileKind(name) {
  if (name.endsWith('-brief.md')) return 'brief';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.md')) return 'md';
  return null;
}

/** @param {string} name */
function legacyBasename(name) {
  return name
    .replace(/-brief\.md$/i, '')
    .replace(/\.json$/i, '')
    .replace(/\.md$/i, '');
}

/**
 * @param {object} parsed from parseReportFilename
 * @param {object | null} json
 */
function compactBasenameForGroup(parsed, json) {
  const days = json?.assessment_window?.days ?? parsed.days ?? 1;
  const generatedAt = json?.generated_at ?? null;
  const hhmm = hhmmFromRunMeta(parsed.runId, generatedAt);
  const runAt = runAtForBasename(parsed.reportDate, hhmm, generatedAt);
  return buildReportBasename({
    scopeId: parsed.scopeId,
    days,
    reportDate: parsed.reportDate,
    runAt,
  });
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function collectGroups() {
  /** @type {Map<string, { parsed: ReturnType<typeof parseReportFilename>, files: Map<string, string> }>} */
  const groups = new Map();

  for (const name of readdirSync(reportsDir)) {
    if (name === '.gitkeep') continue;
    if (name.startsWith('omission-audit')) continue;

    const kind = reportFileKind(name);
    if (!kind) continue;

    const base = legacyBasename(name);
    if (COMPACT_REPORT_BASENAME_RE.test(base)) continue;

    const parsed = parseReportFilename(name);
    if (!parsed) {
      console.warn(`skip (unparsed): ${name}`);
      continue;
    }

    const hhmm = hhmmFromRunMeta(parsed.runId, null);
    const key = `${parsed.scopeId}|${parsed.reportDate}|${hhmm}`;
    let group = groups.get(key);
    if (!group) {
      group = { parsed, files: new Map() };
      groups.set(key, group);
    }
    group.files.set(kind, name);
  }

  return groups;
}

function planRenames(groups) {
  /** @type {Array<{ from: string, to: string }>} */
  const moves = [];
  /** @type {Set<string>} */
  const usedTargets = new Set();

  for (const group of groups.values()) {
    const jsonName = group.files.get('json');
    const json = jsonName ? readJsonSafe(join(reportsDir, jsonName)) : null;
    const compact = compactBasenameForGroup(group.parsed, json);

    if (usedTargets.has(compact)) {
      console.error(`duplicate compact basename: ${compact}`);
      process.exit(1);
    }
    usedTargets.add(compact);

    for (const [kind, from] of group.files.entries()) {
      const ext = kind === 'brief' ? '-brief.md' : kind === 'json' ? '.json' : '.md';
      const to = `${compact}${ext}`;
      if (from === to) continue;
      moves.push({ from, to });
    }
  }

  moves.sort((a, b) => a.from.localeCompare(b.from));
  return moves;
}

function main() {
  if (!existsSync(reportsDir)) {
    console.error(`Reports dir missing: ${reportsDir}`);
    process.exit(1);
  }

  const groups = collectGroups();
  const moves = planRenames(groups);

  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'}: ${moves.length} renames in ${reportsDir}`);
  for (const { from, to } of moves) {
    const dest = join(reportsDir, to);
    if (existsSync(dest) && from !== to) {
      console.error(`blocked: target exists ${to} (from ${from})`);
      process.exit(1);
    }
    console.log(`  ${from}  →  ${to}`);
  }

  if (!APPLY) {
    console.log('\nRe-run with --apply to execute.');
    return;
  }

  for (const { from, to } of moves) {
    renameSync(join(reportsDir, from), join(reportsDir, to));
  }
  console.log(`Done: ${moves.length} files renamed.`);
}

main();
