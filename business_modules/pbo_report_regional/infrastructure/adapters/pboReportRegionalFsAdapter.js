import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { IPboReportRegionalRepository } from '../../domain/ports/IPboReportRegionalRepository.js';
import {
  REGIONAL_PBO_REGION_IDS,
  REGIONAL_PBO_REGION_SET,
} from '../../domain/value_objects/regionalPboRegions.js';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

function stripFrontmatter(content) {
  const raw = String(content ?? '');
  if (!raw.startsWith('---\n')) return { metadata: {}, body: raw };
  const end = raw.indexOf('\n---', 4);
  if (end < 0) return { metadata: {}, body: raw };
  const metadata = {};
  for (const line of raw.slice(4, end).split('\n')) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    metadata[match[1].trim().toLowerCase()] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return { metadata, body: raw.slice(end + 4).replace(/^\s+/, '') };
}

function inferRegionId(fileName, metadata) {
  const fromMetadata = String(metadata.region ?? metadata.regionid ?? '').trim().toLowerCase();
  if (REGIONAL_PBO_REGION_SET.has(fromMetadata)) return fromMetadata;

  const lower = basename(fileName, extname(fileName)).toLowerCase();
  return REGIONAL_PBO_REGION_IDS.find((id) => {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(lower);
  }) ?? null;
}

function inferDate(fileName, metadata) {
  const fromMetadata = String(metadata.date ?? '').trim();
  if (DATE_RE.test(fromMetadata)) return fromMetadata.match(DATE_RE)[1];
  return basename(fileName).match(DATE_RE)?.[1] ?? null;
}

function inferTitle(fileName, body, metadata) {
  const fromMetadata = String(metadata.title ?? '').trim();
  if (fromMetadata) return fromMetadata;
  const heading = String(body ?? '').match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || basename(fileName, extname(fileName));
}

function buildExcerpt(body) {
  return String(body ?? '')
    .replace(/^#+\s+.+$/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

export class PboReportRegionalFsAdapter extends IPboReportRegionalRepository {
  constructor({ dataDir }) {
    super();
    this.dataDir = resolve(dataDir);
  }

  listReports({ regionId }) {
    if (!existsSync(this.dataDir)) return [];

    const reports = [];
    for (const ent of readdirSync(this.dataDir, { withFileTypes: true })) {
      if (!ent.isFile() || ent.name.startsWith('.')) continue;
      if (!MARKDOWN_EXTENSIONS.has(extname(ent.name).toLowerCase())) continue;

      const fullPath = resolve(this.dataDir, ent.name);
      let stat;
      let content;
      try {
        stat = statSync(fullPath);
        if (!stat.isFile()) continue;
        content = readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      const { metadata, body } = stripFrontmatter(content);
      const reportRegionId = inferRegionId(ent.name, metadata);
      if (reportRegionId !== regionId) continue;

      reports.push({
        file: ent.name,
        inboxPath: `data/${ent.name}`,
        regionId: reportRegionId,
        date: inferDate(ent.name, metadata),
        title: inferTitle(ent.name, body, metadata),
        content: body,
        excerpt: buildExcerpt(body),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }

    reports.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return b.date.localeCompare(a.date);
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return b.mtimeMs - a.mtimeMs || a.file.localeCompare(b.file);
    });

    return reports;
  }
}

export function createPboReportRegionalFsAdapter(opts) {
  return new PboReportRegionalFsAdapter(opts);
}
