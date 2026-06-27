import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  HOMEFRONT_FILE_RE,
  parseHomefrontDateFromFileName,
  parseHomefrontMarkdown,
} from '../../domain/services/homefrontMarkdownParser.js';

function readParsedFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  return parseHomefrontMarkdown(content, filePath);
}

/**
 * @param {{ rootDir: string, articlesDir?: string }} opts
 */
export function createNewsSitesFsAdapter(opts) {
  const rootDir = opts.rootDir;
  const articlesDir = opts.articlesDir
    ?? resolve(rootDir, 'business_modules', 'news-sites', 'articles_extracted');

  function listDatedFiles() {
    if (!existsSync(articlesDir)) return [];
    return readdirSync(articlesDir)
      .filter((name) => HOMEFRONT_FILE_RE.test(name))
      .map((name) => ({
        name,
        date: parseHomefrontDateFromFileName(name),
        path: resolve(articlesDir, name),
      }))
      .filter((entry) => entry.date)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  return {
    articlesDir() {
      return articlesDir;
    },

    listAvailableDates() {
      return listDatedFiles().map(({ date, name, path }) => {
        let articleCount = 0;
        let filteredFrom = null;
        let filteredTo = null;
        let modifiedAt = null;
        try {
          const parsed = readParsedFile(path);
          articleCount = parsed.articles.length;
          filteredFrom = parsed.filteredFrom;
          filteredTo = parsed.filteredTo;
          modifiedAt = statSync(path).mtime.toISOString();
        } catch {
          /* ignore unreadable file */
        }
        return {
          date,
          fileName: name,
          articleCount,
          filteredFrom,
          filteredTo,
          modifiedAt,
        };
      });
    },

    loadDailyFeed(date) {
      const match = listDatedFiles().find((f) => f.date === date);
      if (!match) return null;
      const parsed = readParsedFile(match.path);
      return {
        date,
        fileName: match.name,
        filteredFrom: parsed.filteredFrom,
        filteredTo: parsed.filteredTo,
        sourceCount: new Set(parsed.articles.map((a) => a.source).filter(Boolean)).size,
        articles: parsed.articles.map((a) => {
          const sample = `${a.title ?? ''} ${a.body ?? ''}`.trim();
          let nonLatin = 0;
          for (const ch of sample.slice(0, 400)) {
            if ((ch.codePointAt(0) ?? 0) > 0x7f) nonLatin += 1;
          }
          const sourceLang = sample && nonLatin > sample.slice(0, 400).length * 0.12 ? 'he' : 'en';
          return {
            id: `${basename(match.path)}#${a.idx1}`,
            title: a.title,
            url: a.url,
            publishedAt: a.publishedAt,
            source: a.source,
            body: a.body,
            sourceLang,
          };
        }),
      };
    },
  };
}
