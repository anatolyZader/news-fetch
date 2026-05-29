/**
 * Stable source_id builders for the source archive.
 *
 * Schemes:
 * - md:{repoRelativePath}#{articleIndex} — markdown export articles (1-based index)
 * - archive:{source_type}:{digest} — hash fallback when no file index
 * - legacy:db:evidence_items:{id} — migrated rows (read bridge only)
 */
import { createHash } from 'node:crypto';
import { relative } from 'node:path';

const MD_EVIDENCE_ID_RE = /^md:(.+)#(\d+)$/;
const LEGACY_DB_ID_RE = /^db:evidence_items:(\d+)$/;

export function buildMdSourceId(sourceFile, idx1) {
  const file = String(sourceFile ?? '').trim();
  const idx = Number.parseInt(String(idx1), 10);
  if (!file || !Number.isFinite(idx) || idx <= 0) {
    throw new Error('buildMdSourceId requires sourceFile and positive idx1');
  }
  return `md:${file}#${idx}`;
}

/**
 * @param {string} repoRoot
 * @param {string} absoluteOrRelativePath
 * @param {number} idx1
 */
export function buildMdSourceIdFromPath(repoRoot, absoluteOrRelativePath, idx1) {
  const rel = relative(repoRoot, absoluteOrRelativePath).replaceAll('\\', '/');
  return buildMdSourceId(rel, idx1);
}

function digestHex(parts) {
  const raw = parts.filter(Boolean).join('\n');
  return createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 32);
}

/**
 * @param {{ source_type: string, source_url?: string, title?: string, date?: string, body?: string }} item
 */
export function buildArchiveSourceId(item) {
  const type = String(item?.source_type ?? 'unknown').trim();
  const url = String(item?.source_url ?? '').trim();
  const title = String(item?.title ?? '').trim();
  const date = String(item?.date ?? '').trim();
  if (url) {
    return `archive:${type}:${digestHex([type, date, url])}`;
  }
  return `archive:${type}:${digestHex([type, date, title, String(item?.body ?? '').slice(0, 200)])}`;
}

export function parseMdSourceId(sourceId) {
  const m = MD_EVIDENCE_ID_RE.exec(String(sourceId ?? ''));
  if (!m) return null;
  const sourceFile = m[1];
  const idx1 = Number.parseInt(m[2], 10);
  if (!sourceFile || !Number.isFinite(idx1) || idx1 <= 0) return null;
  return { sourceFile, idx1 };
}

export function parseLegacyDbSourceId(sourceId) {
  const m = LEGACY_DB_ID_RE.exec(String(sourceId ?? ''));
  if (!m) return null;
  const id = Number.parseInt(m[1], 10);
  return Number.isFinite(id) ? id : null;
}

export function legacyDbSourceId(dbRowId) {
  return `db:evidence_items:${dbRowId}`;
}

/**
 * Assign source_id on an ingest item if missing.
 * @param {object} item
 * @param {{ repoRoot?: string, mdPath?: string, mdIndex?: number }} [opts]
 */
export function ensureSourceId(item, opts = {}) {
  if (item?.source_id) return item.source_id;
  if (opts.mdPath != null && opts.mdIndex != null) {
    const id = opts.repoRoot
      ? buildMdSourceIdFromPath(opts.repoRoot, opts.mdPath, opts.mdIndex)
      : buildMdSourceId(opts.mdPath, opts.mdIndex);
    return id;
  }
  return buildArchiveSourceId(item);
}
