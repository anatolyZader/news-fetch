#!/usr/bin/env node
/**
 * Report-only Safe Browsing sweep over stored citation URLs.
 * Sources: source_archive.source_url (SQLite) + signals[].article_url from
 * business_modules/(asterisk)/data/signals/signals-*-<date>.json files within the window.
 * Writes a JSON report under logs/ — never mutates the DB or signal files.
 *
 * Usage: npm run sweep:url-reputation [-- --days 7]
 */
import 'dotenv/config';
import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openAppDatabase } from '../persistence/openDatabase.js';
import { resolveSqlitePath } from '../../cross-cut-modules/config/sqlitePath.js';
import { createUrlReputationChecker } from '../../cross-cut-modules/security/index.js';
import { getTodayInTimezone } from '../../utils/dateUtils.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SIGNALS_FILE_RE = /^signals-.*(\d{4}-\d{2}-\d{2})\.json$/;

function cutoffDate(today, days) {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function parseDaysArg(argv) {
  const at = argv.indexOf('--days');
  if (at === -1) return 7;
  const n = Number.parseInt(argv[at + 1] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

function isSweepableUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function addUrl(urlSources, url, source) {
  if (!isSweepableUrl(url)) return;
  if (!urlSources.has(url)) urlSources.set(url, new Set());
  urlSources.get(url).add(source);
}

function collectArchiveUrls(urlSources, cutoff) {
  const db = openAppDatabase(resolveSqlitePath(), { readOnly: true });
  try {
    const rows = db
      .prepare(
        "SELECT DISTINCT source_url FROM source_archive WHERE date >= ? AND source_url IS NOT NULL AND source_url <> ''",
      )
      .all(cutoff);
    for (const row of rows) addUrl(urlSources, row.source_url, 'source_archive');
    return rows.length;
  } finally {
    db.close();
  }
}

function collectFromSignalsFile(urlSources, filePath, relPath) {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  for (const signal of Array.isArray(parsed?.signals) ? parsed.signals : []) {
    addUrl(urlSources, signal?.article_url, relPath);
  }
}

function collectSignalFileUrls(urlSources, cutoff) {
  const modulesDir = join(REPO_ROOT, 'business_modules');
  let filesScanned = 0;
  for (const moduleName of readdirSync(modulesDir)) {
    const signalsDir = join(modulesDir, moduleName, 'data', 'signals');
    if (!existsSync(signalsDir)) continue;
    for (const fileName of readdirSync(signalsDir)) {
      const match = SIGNALS_FILE_RE.exec(fileName);
      if (!match || match[1] < cutoff) continue;
      const relPath = `business_modules/${moduleName}/data/signals/${fileName}`;
      try {
        collectFromSignalsFile(urlSources, join(signalsDir, fileName), relPath);
        filesScanned += 1;
      } catch (err) {
        console.warn(`skipping unreadable signals file ${relPath}: ${err.message}`);
      }
    }
  }
  return filesScanned;
}

async function main() {
  const days = parseDaysArg(process.argv.slice(2));
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const today = getTodayInTimezone(timezone);
  const cutoff = cutoffDate(today, days);

  const checker = createUrlReputationChecker();
  if (!checker.enabled) {
    console.log('sweep:url-reputation: SAFE_BROWSING_API_KEY not set — sweep disabled, nothing checked');
    return;
  }

  /** @type {Map<string, Set<string>>} */
  const urlSources = new Map();
  const archiveRows = collectArchiveUrls(urlSources, cutoff);
  const filesScanned = collectSignalFileUrls(urlSources, cutoff);
  const urls = [...urlSources.keys()];

  const results = await checker.checkUrls(urls);
  const flagged = [];
  let uncheckedCount = 0;
  for (const [url, result] of results) {
    if (result.status === 'flagged') {
      flagged.push({ url, threatType: result.threatType, sources: [...urlSources.get(url)] });
    } else if (result.status === 'unchecked') {
      uncheckedCount += 1;
    }
  }

  const report = {
    ranAt: new Date().toISOString(),
    days,
    cutoffDate: cutoff,
    archiveRows,
    signalFilesScanned: filesScanned,
    totalUrls: urls.length,
    flagged,
    uncheckedCount,
  };
  const logsDir = join(REPO_ROOT, 'logs');
  mkdirSync(logsDir, { recursive: true });
  const reportPath = join(logsDir, `url-reputation-sweep-${today}.json`);
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    `sweep:url-reputation: window=${cutoff}..${today} urls=${urls.length} ` +
    `(archive rows=${archiveRows}, signal files=${filesScanned}) ` +
    `flagged=${flagged.length} unchecked=${uncheckedCount} — report: ${reportPath}`,
  );
  for (const hit of flagged) {
    console.log(`  FLAGGED ${hit.threatType}: ${hit.url} (${hit.sources.join(', ')})`);
  }
  if (flagged.length > 0) {
    console.log('report only — no data was modified; review the report and act manually');
  }
}

main().catch((err) => {
  console.error('sweepUrlReputation failed:', err.message);
  process.exit(1);
});
