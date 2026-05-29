import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { IPboReportRegionalRepository } from '../../domain/ports/IPboReportRegionalRepository.js';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const FRONTMATTER_LINE_RE = /^([A-Za-z0-9_-]+):\s*(.*)$/;
const HEADING_RE = /^#\s+(.+)$/m;

function stripFrontmatter(content) {
  const raw = String(content ?? '');
  if (!raw.startsWith('---\n')) return { metadata: {}, body: raw };
  const end = raw.indexOf('\n---', 4);
  if (end < 0) return { metadata: {}, body: raw };
  const metadata = {};
  for (const line of raw.slice(4, end).split('\n')) {
    const match = FRONTMATTER_LINE_RE.exec(line);
    if (!match) continue;
    metadata[match[1].trim().toLowerCase()] = match[2].trim().replaceAll(/^["']|["']$/g, '');
  }
  return { metadata, body: raw.slice(end + 4).replace(/^\s+/, '') };
}

function inferRegionId(fileName, metadata, allowedRegionIds) {
  const allowed = allowedRegionIds instanceof Set ? allowedRegionIds : new Set(allowedRegionIds ?? []);
  const fromMetadata = String(metadata.region ?? metadata.regionid ?? '').trim().toLowerCase();
  if (allowed.has(fromMetadata)) return fromMetadata;

  const lower = basename(fileName, extname(fileName)).toLowerCase();
  for (const id of allowed) {
    const escaped = id.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const regionPattern = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`);
    if (regionPattern.exec(lower)) return id;
  }
  return null;
}

function inferDate(fileName, metadata) {
  const fromMetadata = String(metadata.date ?? '').trim();
  const metadataMatch = DATE_RE.exec(fromMetadata);
  if (metadataMatch) return metadataMatch[1];
  const fileMatch = DATE_RE.exec(basename(fileName));
  return fileMatch?.[1] ?? null;
}

function inferTitle(fileName, body, metadata) {
  const fromMetadata = String(metadata.title ?? '').trim();
  if (fromMetadata) return fromMetadata;
  const headingMatch = HEADING_RE.exec(String(body ?? ''));
  const heading = headingMatch?.[1]?.trim();
  return heading || basename(fileName, extname(fileName));
}

function buildExcerpt(body) {
  return String(body ?? '')
    .replaceAll(/^#+\s+.+$/gm, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

export class PboReportRegionalFsAdapter extends IPboReportRegionalRepository {
  constructor({ dataDir } = {}) {
    super();
    this.defaultDataDir = dataDir ? resolve(dataDir) : null;
  }

  listReports({ regionId, inboxDir, allowedRegionIds }) {
    const dir = resolve(inboxDir ?? this.defaultDataDir ?? '');
    if (!dir || !existsSync(dir)) return [];

    const allowed = new Set(allowedRegionIds ?? [regionId].filter(Boolean));

    const reports = [];
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      if (!ent.isFile() || ent.name.startsWith('.')) continue;
      if (!MARKDOWN_EXTENSIONS.has(extname(ent.name).toLowerCase())) continue;

      const fullPath = resolve(dir, ent.name);
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
      const reportRegionId = inferRegionId(ent.name, metadata, allowed);
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
