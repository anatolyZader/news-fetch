/**
 * Index labeled social OSINT examples for few-shot classification RAG.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOCIAL_EXAMPLES_INDEX_DATE = '2099-01-01';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_DATA_DIR = resolve(REPO_ROOT, 'business_modules/social_media/data');

function formatKeepExample(finding) {
  return [
    'keep: true',
    `platform: ${finding.platform ?? ''}`,
    `quote: ${String(finding.quote_original ?? finding.text ?? '').slice(0, 500)}`,
    `behavior: ${finding.behavior_or_emotion ?? ''}`,
    `component: ${finding.resilience_component ?? ''}`,
    `reason: ${finding.relevance_reason ?? ''}`,
  ].join('\n');
}

function formatRejectExample(ex) {
  return [
    'keep: false',
    `id: ${ex.id ?? ''}`,
    `reason: ${ex.reason ?? ''}`,
    `text: ${String(ex.text ?? ex.quote ?? '').slice(0, 400)}`,
  ].join('\n');
}

/**
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 * @param {{ dataDir?: string, maxPerFile?: number, days?: number }} [opts]
 */
export function createSocialExamplesIndexWriter(indexWriter, opts = {}) {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;
  const maxPerFile = opts.maxPerFile ?? 50;

  return {
    async reindexSocialExamples(reindexOpts = {}) {
      const days = reindexOpts.days ?? opts.days ?? 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      let files;
      try {
        files = readdirSync(dataDir).filter((f) => /^signals-social-\d{4}-\d{2}-\d{2}\.json$/.test(f));
      } catch {
        return { chunks: 0, files: 0 };
      }

      let total = 0;
      let fileCount = 0;

      for (const file of files.sort()) {
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/);
        const fileDate = dateMatch?.[1];
        if (fileDate && fileDate < cutoffStr) continue;

        const fullPath = resolve(dataDir, file);
        let bundle;
        try {
          bundle = JSON.parse(readFileSync(fullPath, 'utf8'));
        } catch {
          continue;
        }
        fileCount++;

        const findings = (bundle.findings ?? []).slice(0, maxPerFile);
        for (let i = 0; i < findings.length; i++) {
          const f = findings[i];
          const body = formatKeepExample(f);
          const r = await indexWriter.indexChunksForParent({
            namespace: 'social_examples',
            parentId: `social_example:keep:${fileDate}:${f.id ?? i}`,
            date: SOCIAL_EXAMPLES_INDEX_DATE,
            body,
            sourceType: 'social_examples',
            title: `KEEP ${f.platform ?? 'social'}`,
            sourceUrl: f.url ?? null,
            kind: 'social_keep',
          });
          total += r.chunks;
        }

        const rejected = (bundle.rejected_examples ?? []).slice(0, maxPerFile);
        for (let i = 0; i < rejected.length; i++) {
          const ex = rejected[i];
          const body = formatRejectExample(ex);
          const r = await indexWriter.indexChunksForParent({
            namespace: 'social_examples',
            parentId: `social_example:reject:${fileDate}:${ex.id ?? i}`,
            date: SOCIAL_EXAMPLES_INDEX_DATE,
            body,
            sourceType: 'social_examples',
            title: `REJECT ${ex.reason ?? 'off_topic'}`,
            sourceUrl: null,
            kind: 'social_reject',
          });
          total += r.chunks;
        }
      }

      return { chunks: total, files: fileCount };
    },
  };
}

export { SOCIAL_EXAMPLES_INDEX_DATE, DEFAULT_DATA_DIR };
