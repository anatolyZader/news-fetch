/**
 * Index controlled HFC field guidelines markdown for draft-time RAG.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HFC_INDEX_DATE = '2099-01-01';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_GUIDELINES_PATH = resolve(REPO_ROOT, 'docs/corpora/hfc-field-guidelines.md');

/**
 * Split markdown into sections by ## headings.
 * @param {string} md
 */
function splitMarkdownSections(md) {
  const sections = [];
  const parts = String(md ?? '').split(/^## /m);
  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i].trim();
    if (!chunk) continue;
    const lines = chunk.split('\n');
    const title = i === 0 && !chunk.startsWith('#') ? 'Introduction' : lines[0].trim();
    const body = i === 0 && title === 'Introduction' ? chunk : lines.slice(1).join('\n').trim();
    sections.push({ title, body: body || chunk });
  }
  return sections;
}

/**
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 * @param {{ guidelinesPath?: string }} [opts]
 */
export function createHfcGuidelinesIndexWriter(indexWriter, opts = {}) {
  const guidelinesPath = opts.guidelinesPath ?? DEFAULT_GUIDELINES_PATH;

  return {
    async reindexHfcGuidelines() {
      let md;
      try {
        md = readFileSync(guidelinesPath, 'utf8');
      } catch (err) {
        throw new Error(`hfc guidelines not found at ${guidelinesPath}: ${err.message}`);
      }

      const sections = splitMarkdownSections(md);
      let total = 0;
      let idx = 0;
      for (const sec of sections) {
        const body = `# ${sec.title}\n\n${sec.body}`.trim();
        if (!body) continue;
        const slug = sec.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '_').slice(0, 40) || `sec_${idx}`;
        const r = await indexWriter.indexChunksForParent({
          namespace: 'hfc',
          parentId: `hfc:guideline:${slug}`,
          date: HFC_INDEX_DATE,
          body,
          sourceType: 'hfc',
          title: sec.title,
          sourceUrl: null,
          kind: 'hfc_guideline',
        });
        total += r.chunks;
        idx++;
      }
      return { chunks: total, sections: sections.length };
    },
  };
}

export { HFC_INDEX_DATE, DEFAULT_GUIDELINES_PATH };
