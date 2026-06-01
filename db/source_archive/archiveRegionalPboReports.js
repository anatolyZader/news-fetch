/**
 * Archive regional PBO markdown reports into source_archive + RAG index.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { buildArchiveSourceId } from './sourceId.js';
import { persistOriginalSources } from './persistOriginals.js';

const MD_EXT = new Set(['.md', '.markdown']);

function stripFrontmatter(content) {
  const raw = String(content ?? '');
  if (!raw.startsWith('---\n')) return { metadata: {}, body: raw };
  const end = raw.indexOf('\n---', 4);
  if (end < 0) return { metadata: {}, body: raw };
  const metadata = {};
  for (const line of raw.slice(4, end).split('\n')) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) metadata[m[1].trim().toLowerCase()] = m[2].trim();
  }
  return { metadata, body: raw.slice(end + 4).replace(/^\s+/, '') };
}

/**
 * @param {ReturnType<import('./createSourceArchive.js').createSourceArchive>} archive
 * @param {{ inboxDir: string, districtId: string, regionId?: string, date: string, retrievalIndexer?: object|null }} opts
 */
export async function archiveRegionalPboReports(archive, opts) {
  const dir = resolve(opts.inboxDir ?? '');
  const districtId = String(opts.districtId ?? 'north').trim();
  let archived = 0;
  const indexer = opts.retrievalIndexer ?? null;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return { archived: 0 };
  }

  for (const ent of entries) {
    if (!ent.isFile() || ent.name.startsWith('.')) continue;
    if (!MD_EXT.has(extname(ent.name).toLowerCase())) continue;

    const fullPath = resolve(dir, ent.name);
    const raw = readFileSync(fullPath, 'utf8');
    const { metadata, body } = stripFrontmatter(raw);
    const dateMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(metadata.date ?? ent.name);
    const date = dateMatch?.[1] ?? opts.date;
    const regionId = String(metadata.region ?? metadata.regionid ?? opts.regionId ?? 'unknown').trim();
    const title = metadata.title ?? basename(ent.name, extname(ent.name));

    const sourceId = buildArchiveSourceId({
      source_type: 'pbo_regional',
      date,
      title: `${districtId}:${regionId}:${title}`,
      body: body.slice(0, 200),
    });

    const item = {
      source_id: sourceId,
      date,
      source_type: 'pbo_regional',
      source_label: regionId,
      source_url: '',
      title,
      body: body.slice(0, 12000),
      published_at: date,
      module_ref: fullPath,
      district_id: districtId,
    };

    persistOriginalSources(archive, [item]);
    archived += 1;

    if (indexer?.indexArchiveRow) {
      await indexer.indexArchiveRow({
        ...item,
        scope_id: districtId,
      });
    }
  }

  if (indexer?.rebuildFts) indexer.rebuildFts();
  return { archived };
}
