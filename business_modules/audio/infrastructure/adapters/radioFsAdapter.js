import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  parseAudioMarkdown,
  parseRadioDateFromFileName,
  parseRadioFileMeta,
  RADIO_FILE_RE,
} from '../../domain/services/audioMarkdownParser.js';

function readParsedFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  return parseAudioMarkdown(content, filePath);
}

/**
 * @param {{ rootDir: string, searchDirs?: string[] }} opts
 */
export function createRadioFsAdapter(opts) {
  const rootDir = opts.rootDir;
  const searchDirs = opts.searchDirs?.length
    ? opts.searchDirs.map((d) => resolve(rootDir, d))
    : [rootDir];

  function listMdFiles() {
    const byPath = new Map();
    for (const dir of searchDirs) {
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (!RADIO_FILE_RE.test(name)) continue;
        const path = resolve(dir, name);
        if (!byPath.has(name)) byPath.set(name, path);
      }
    }
    return [...byPath.entries()].map(([name, path]) => ({
      name,
      path,
      date: parseRadioDateFromFileName(name),
      ...parseRadioFileMeta(name),
    })).filter((f) => f.date);
  }

  return {
    searchDirs() {
      return searchDirs;
    },

    listAvailableDates() {
      const files = listMdFiles();
      const byDate = new Map();

      for (const file of files) {
        const entry = byDate.get(file.date) ?? {
          date: file.date,
          fileCount: 0,
          segmentCount: 0,
          stations: new Set(),
          modifiedAt: null,
        };
        entry.fileCount += 1;
        if (file.station) entry.stations.add(file.station);
        try {
          const parsed = readParsedFile(file.path);
          entry.segmentCount += parsed.segments.length;
          const mtime = statSync(file.path).mtime.toISOString();
          if (!entry.modifiedAt || mtime > entry.modifiedAt) entry.modifiedAt = mtime;
        } catch {
          /* ignore */
        }
        byDate.set(file.date, entry);
      }

      return [...byDate.values()]
        .map((entry) => ({
          date: entry.date,
          fileCount: entry.fileCount,
          segmentCount: entry.segmentCount,
          stations: [...entry.stations].sort((a, b) => a.localeCompare(b)),
          modifiedAt: entry.modifiedAt,
        }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    },

    loadDailyFeed(date) {
      const files = listMdFiles().filter((f) => f.date === date);
      if (!files.length) return null;

      const sortedFiles = [...files].sort((a, b) => a.name.localeCompare(b.name));
      const broadcasts = [];
      const segments = [];

      for (const file of sortedFiles) {
        const parsed = readParsedFile(file.path);
        broadcasts.push({
          fileName: file.name,
          station: file.station,
          slot: file.slot,
          segmentCount: parsed.segments.length,
        });
        for (const seg of parsed.segments) {
          segments.push({
            id: `${basename(file.path)}#${seg.idx1}`,
            title: seg.title,
            url: seg.url,
            publishedAt: seg.publishedAt,
            source: seg.source,
            station: seg.station,
            program: seg.program,
            body: seg.body,
            fileName: file.name,
          });
        }
      }

      return {
        date,
        fileCount: files.length,
        segmentCount: segments.length,
        stations: [...new Set(segments.map((s) => s.station).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b)),
        broadcasts,
        segments,
      };
    },
  };
}
