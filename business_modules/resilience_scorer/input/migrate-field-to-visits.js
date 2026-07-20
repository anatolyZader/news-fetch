#!/usr/bin/env node
/**
 * One-shot idempotent rewrite: legacy visits identity `field` → `visits`.
 *
 * - Renames signals-field-* → signals-visits-*
 * - Renames observations-pipeline-field-* → observations-pipeline-visits-*
 * - Renames articles-field-reports-* → articles-visits-reports-*
 * - Rewrites JSON source_type "field" → "visits" (not field_whatsapp)
 * - UPDATEs source_archive rows where source_type = 'field'
 *
 * Usage: node business_modules/resilience_scorer/input/migrate-field-to-visits.js [--dry-run]
 */
import 'dotenv/config';
import {
  existsSync,
  readdirSync,
  renameSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSqlitePath } from '../../../cross-cut-modules/config/sqlitePath.js';
import { DatabaseSync } from 'node:sqlite';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const dryRun = process.argv.includes('--dry-run');

const stats = {
  renamed: 0,
  removedLegacy: 0,
  jsonRewritten: 0,
  sqliteUpdated: 0,
  warnings: 0,
};

function log(msg) {
  console.log(msg);
}

function walkFiles(dir, predicate, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, predicate, out);
    } else if (predicate(name, full)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @returns {'renamed'|'target_exists'|'missing'}
 */
function renameOrNote(fromPath, toPath) {
  if (!existsSync(fromPath)) return 'missing';
  if (existsSync(toPath)) {
    log(`  ⚠ target exists — rewrite target, remove legacy: ${basename(fromPath)}`);
    stats.warnings += 1;
    return 'target_exists';
  }
  if (dryRun) {
    log(`  [dry-run] rename ${fromPath} → ${toPath}`);
  } else {
    renameSync(fromPath, toPath);
    log(`  rename ${basename(fromPath)} → ${basename(toPath)}`);
  }
  stats.renamed += 1;
  return 'renamed';
}

function removeLegacy(fromPath) {
  if (!existsSync(fromPath)) return;
  if (dryRun) {
    log(`  [dry-run] remove legacy ${fromPath}`);
  } else {
    unlinkSync(fromPath);
    log(`  remove legacy ${basename(fromPath)}`);
  }
  stats.removedLegacy += 1;
}

function rewriteSourceTypeInJson(filePath) {
  if (!existsSync(filePath) || !filePath.endsWith('.json')) return false;
  let raw;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    log(`  ⚠ not JSON, skip rewrite: ${filePath}`);
    stats.warnings += 1;
    return false;
  }

  let changed = false;
  if (data.source_type === 'field') {
    data.source_type = 'visits';
    changed = true;
  }
  if (Array.isArray(data.signals)) {
    for (const s of data.signals) {
      if (s && s.source_type === 'field') {
        s.source_type = 'visits';
        changed = true;
      }
    }
  }
  if (Array.isArray(data.observations)) {
    for (const o of data.observations) {
      if (o && o.source_type === 'field') {
        o.source_type = 'visits';
        changed = true;
      }
    }
  }

  if (!changed) return false;
  if (dryRun) {
    log(`  [dry-run] rewrite source_type in ${filePath}`);
  } else {
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    log(`  rewrite source_type in ${basename(filePath)}`);
  }
  stats.jsonRewritten += 1;
  return true;
}

function migratePair(fromPath, toPath) {
  const status = renameOrNote(fromPath, toPath);
  if (status === 'missing') return;
  if (status === 'renamed') {
    // dry-run: file still at fromPath; live: at toPath
    const jsonPath = dryRun ? fromPath : toPath;
    rewriteSourceTypeInJson(jsonPath);
    return;
  }
  // target_exists: rewrite canonical, drop legacy
  rewriteSourceTypeInJson(toPath);
  removeLegacy(fromPath);
}

function migrateClosedSignals() {
  log('\n=== Closed signal bundles ===');
  const roots = [
    resolve(REPO_ROOT, 'business_modules/visits/data/signals'),
    resolve(REPO_ROOT, 'business_modules/resilience_scorer/data/signals'),
  ];
  const re = /^signals-field-(\d{4}-\d{2}-\d{2})(.*)\.json$/;
  for (const root of roots) {
    for (const fromPath of walkFiles(root, (name) => re.test(name))) {
      const name = basename(fromPath);
      const m = re.exec(name);
      const toPath = join(dirname(fromPath), `signals-visits-${m[1]}${m[2]}.json`);
      migratePair(fromPath, toPath);
    }
    for (const p of walkFiles(root, (name) => /^signals-visits-\d{4}-\d{2}-\d{2}.*\.json$/.test(name))) {
      rewriteSourceTypeInJson(p);
    }
  }
}

function migrateOpenObs() {
  log('\n=== Open observation bundles ===');
  const roots = [
    resolve(REPO_ROOT, 'business_modules/open_observation_extraction/data'),
    resolve(REPO_ROOT, 'business_modules/resilience_scorer/data'),
  ];
  // Match observations-pipeline-field-DATE.json and stamped archive names
  // e.g. observations-pipeline-field-2026-03-24-2026-06-19T13-27-14.json
  const re = /^observations-pipeline-field-(\d{4}-\d{2}-\d{2})(.*)\.json$/;
  for (const root of roots) {
    for (const fromPath of walkFiles(root, (name) => re.test(name))) {
      const name = basename(fromPath);
      const m = re.exec(name);
      const toPath = join(dirname(fromPath), `observations-pipeline-visits-${m[1]}${m[2]}.json`);
      migratePair(fromPath, toPath);
    }
    for (const p of walkFiles(root, (name) => /^observations-pipeline-visits-\d{4}-\d{2}-\d{2}.*\.json$/.test(name))) {
      rewriteSourceTypeInJson(p);
    }
  }
}

function migrateMdReports() {
  log('\n=== Visits markdown reports ===');
  const dir = resolve(REPO_ROOT, 'business_modules/visits/data');
  if (!existsSync(dir)) return;
  const re = /^articles-field-reports-(\d{4}-\d{2}-\d{2})\.md$/;
  for (const name of readdirSync(dir)) {
    const m = re.exec(name);
    if (!m) continue;
    const fromPath = join(dir, name);
    if (!statSync(fromPath).isFile()) continue;
    const toPath = join(dir, `articles-visits-reports-${m[1]}.md`);
    migratePair(fromPath, toPath);
  }
}

function migrateSqlite() {
  log('\n=== SQLite source_archive ===');
  const sqlitePath = resolveSqlitePath(process.env, REPO_ROOT);
  if (!existsSync(sqlitePath)) {
    log(`  ⚠ no sqlite at ${sqlitePath}`);
    stats.warnings += 1;
    return;
  }
  if (dryRun) {
    const db = new DatabaseSync(sqlitePath, { readOnly: true });
    const row = db.prepare(`SELECT COUNT(*) AS n FROM source_archive WHERE source_type = 'field'`).get();
    db.close();
    log(`  [dry-run] would UPDATE ${row.n} source_archive row(s) field → visits`);
    stats.sqliteUpdated += row.n;
    return;
  }
  const db = new DatabaseSync(sqlitePath);
  const info = db.prepare(`UPDATE source_archive SET source_type = 'visits' WHERE source_type = 'field'`).run();
  db.close();
  stats.sqliteUpdated += info.changes;
  log(`  UPDATE source_archive: ${info.changes} row(s) field → visits`);
}

log(`migrate-field-to-visits${dryRun ? ' (dry-run)' : ''} — root ${REPO_ROOT}`);
migrateClosedSignals();
migrateOpenObs();
migrateMdReports();
migrateSqlite();
log('\n=== Summary ===');
log(JSON.stringify(stats, null, 2));
