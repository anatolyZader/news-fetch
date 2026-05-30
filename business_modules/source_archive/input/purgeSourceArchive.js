#!/usr/bin/env node
/**
 * Purge ephemeral source_archive rows (news, radio, social) older than retention window.
 * Field, visits, whatsapp, manual, audio, video, etc. are never purged.
 * Filesystem exports (homefront MD, field reports, …) are never deleted by this job.
 *
 * Cron example (03:00 Asia/Jerusalem):
 *   0 3 * * * cd /path/to/news && node business_modules/source_archive/input/purgeSourceArchive.js >> /var/log/source-archive-purge.log 2>&1
 */
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSourceArchive } from '../../../cross-cut-modules/source_archive/createSourceArchive.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/index.js';
import { EPHEMERAL_SOURCE_TYPES } from '../../../cross-cut-modules/source_archive/retentionPolicy.js';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function cutoffDate(today, retentionDays) {
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - retentionDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const retentionDays = Math.max(
    1,
    Number.parseInt(process.env.SOURCE_ARCHIVE_RETENTION_DAYS ?? '14', 10) || 14,
  );
  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const today = getTodayInTimezone(timezone);
  const cutoff = cutoffDate(today, retentionDays);
  const sqlitePath = process.env.SQLITE_PATH?.trim()
    ? resolve(process.env.SQLITE_PATH.trim())
    : resolve(repoRoot, 'db', 'app.sqlite');

  const retrievalService = createRetrievalService({ dbPath: sqlitePath, timezone });
  const archive = createSourceArchive(sqlitePath, { retrievalIndexer: retrievalService });
  const { deleted } = archive.purgeEphemeralBeforeDate(cutoff);
  const ragDeleted = retrievalService.deleteEphemeralBeforeDate(cutoff, EPHEMERAL_SOURCE_TYPES);
  archive.close();
  retrievalService.close();
  const types = EPHEMERAL_SOURCE_TYPES.join('|');
  console.log(
    `source_archive purge: deleted=${deleted} ephemeral rows only (${types}) with date < ${cutoff} ` +
    `(retention=${retentionDays}d, today=${today}); rag_chunks deleted=${ragDeleted}; ` +
    'field/visits/whatsapp/manual/audio/video and filesystem exports are never purged',
  );
}

main().catch((err) => {
  console.error('purgeSourceArchive failed:', err.message);
  process.exit(1);
});
