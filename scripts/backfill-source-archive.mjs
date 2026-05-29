#!/usr/bin/env node
/**
 * Backfill source_archive from evidence_items, markdown exports, and signal bundles (idempotent).
 *
 * Usage: node scripts/backfill-source-archive.mjs [--days 14]
 */
import 'dotenv/config';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createSourceArchive } from '../cross-cut-modules/source_archive/createSourceArchive.js';
import { createEvidenceStore } from '../cross-cut-modules/persistence/evidenceStore.js';
import { persistOriginalSources } from '../cross-cut-modules/source_archive/persistOriginals.js';
import { buildMdSourceIdFromPath, legacyDbSourceId } from '../cross-cut-modules/source_archive/sourceId.js';
import { loadMarkdownArticlesFromFile } from '../cross-cut-modules/source_archive/markdownArticles.js';
import { archiveSocialFindings } from '../cross-cut-modules/source_archive/archiveSocialFindings.js';
import { archiveProbeRecords } from '../cross-cut-modules/source_archive/archiveProbeRecords.js';
import { loadProbeRecordsForDate } from '../business_modules/resilience/infrastructure/adapters/connectivityProbeFileAdapter.js';
import { getTodayInTimezone } from '../utils/dateUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--days');
  const days = i >= 0 ? Number.parseInt(args[i + 1], 10) : 14;
  return { days: Number.isFinite(days) ? days : 14 };
}

function datesInWindow(today, days) {
  const out = [];
  const base = new Date(`${today}T12:00:00`);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function backfillEvidenceItems(archive, evidenceStore, dates) {
  let n = 0;
  for (const date of dates) {
    const rows = evidenceStore.getByDate(date) ?? [];
    const items = rows.map((row) => ({
      source_id: legacyDbSourceId(row.id),
      date: row.date,
      source_type: row.source_type,
      source_label: row.source_label,
      source_url: row.source_url,
      title: row.title,
      body: row.body,
      published_at: row.published_at,
      module_ref: 'evidence_items',
    }));
    n += persistOriginalSources(archive, items).archived;
  }
  return n;
}

function backfillMdDir(archive, dates, { dir, pattern, source_type }) {
  let n = 0;
  for (const date of dates) {
    const p = resolve(dir, pattern(date));
    if (!existsSync(p)) continue;
    const articles = loadMarkdownArticlesFromFile(p);
    const items = articles.map((a) => ({
      source_id: buildMdSourceIdFromPath(repoRoot, p, a.idx1),
      date,
      source_type,
      source_label: a.source,
      source_url: a.url,
      title: a.title,
      body: a.body,
      published_at: a.publishedAt || date,
      module_ref: p,
    }));
    n += persistOriginalSources(archive, items).archived;
  }
  return n;
}

function backfillRadioMd(archive, dates) {
  let n = 0;
  let names = [];
  try {
    names = readdirSync(repoRoot);
  } catch {
    return n;
  }
  for (const date of dates) {
    const files = names.filter((f) => f.startsWith('articles-audio-') && f.includes(date) && f.endsWith('.md'));
    for (const f of files) {
      const p = join(repoRoot, f);
      const articles = loadMarkdownArticlesFromFile(p);
      const items = articles.map((a) => ({
        source_id: buildMdSourceIdFromPath(repoRoot, p, a.idx1),
        date,
        source_type: 'radio',
        source_label: a.source,
        source_url: a.url,
        title: a.title,
        body: a.body,
        published_at: a.publishedAt || date,
        module_ref: p,
      }));
      n += persistOriginalSources(archive, items).archived;
    }
  }
  return n;
}

function backfillSocialBundles(archive, dates) {
  let n = 0;
  for (const date of dates) {
    const p = resolve(repoRoot, 'business_modules/social_media/data', `signals-social-${date}.json`);
    if (!existsSync(p)) continue;
    try {
      const bundle = JSON.parse(readFileSync(p, 'utf8'));
      n += archiveSocialFindings(archive, bundle.findings, date, { moduleRef: p }).archived;
    } catch { /* skip */ }
  }
  return n;
}

function backfillProbes(archive, dates) {
  let n = 0;
  for (const date of dates) {
    const records = loadProbeRecordsForDate(date, 'national');
    n += archiveProbeRecords(archive, records, date);
  }
  return n;
}

async function main() {
  const { days } = parseArgs();
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const today = getTodayInTimezone(timezone);
  const dates = datesInWindow(today, days);
  const sqlitePath = process.env.SQLITE_PATH?.trim()
    ? resolve(process.env.SQLITE_PATH.trim())
    : resolve(repoRoot, 'data', 'app.sqlite');

  const archive = createSourceArchive(sqlitePath);
  const evidenceStore = createEvidenceStore(sqlitePath);

  const fromDb = backfillEvidenceItems(archive, evidenceStore, dates);
  const fromNews = backfillMdDir(archive, dates, {
    dir: resolve(repoRoot, 'business_modules/news-sites/articles_extracted'),
    pattern: (d) => `articles-homefront-${d}.md`,
    source_type: 'news',
  });
  const fromField = backfillMdDir(archive, dates, {
    dir: resolve(repoRoot, 'business_modules/visits/data'),
    pattern: (d) => `articles-field-reports-${d}.md`,
    source_type: 'field',
  });
  const fromWhatsapp = backfillMdDir(archive, dates, {
    dir: resolve(repoRoot, 'business_modules/whatsapp/reports'),
    pattern: (d) => `whatsapp_reports-${d}.md`,
    source_type: 'whatsapp',
  });
  const fromRadio = backfillRadioMd(archive, dates);
  const fromSocial = backfillSocialBundles(archive, dates);
  const fromProbes = backfillProbes(archive, dates);

  archive.close();
  evidenceStore.close();

  const total = fromDb + fromNews + fromField + fromWhatsapp + fromRadio + fromSocial + fromProbes;
  console.log(
    `backfill-source-archive: days=${days} evidence=${fromDb} news=${fromNews} field=${fromField} ` +
    `whatsapp=${fromWhatsapp} radio=${fromRadio} social=${fromSocial} probes=${fromProbes} total=${total}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
