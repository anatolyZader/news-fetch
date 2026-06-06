/**
 * Index product doc pages into rag_chunks (namespace=docs).
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { buildProductDocsIndex, loadProductDocPage } from '../../utils/productDocs.js';

const DOCS_INDEX_DATE = '2099-01-01';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function docsCorpusVersion() {
  if (process.env.DOCS_RAG_VERSION?.trim()) {
    return process.env.DOCS_RAG_VERSION.trim();
  }
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'),
    );
    return String(pkg.version ?? 'current');
  } catch {
    return 'current';
  }
}

function shouldSkipSlug(slug) {
  if (!slug) return true;
  if (slug.startsWith('api/generated')) return true;
  return false;
}

function formatDocIndexText(meta, body, slug, gated) {
  const tags = Array.isArray(meta?.tags) ? meta.tags.join(', ') : '';
  const audience = Array.isArray(meta?.audience) ? meta.audience.join(', ') : '';
  return [
    `slug: ${slug}`,
    `title: ${meta?.title ?? slug}`,
    `description: ${meta?.description ?? ''}`,
    `intent: ${meta?.intent ?? ''}`,
    `gated: ${gated ? 'true' : 'false'}`,
    `tags: ${tags}`,
    `audience: ${audience}`,
    '',
    String(body ?? '').trim(),
  ].join('\n');
}

/**
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 * @param {{ docsRootDir?: string }} [opts]
 */
export function createDocsIndexWriter(indexWriter, opts = {}) {
  const defaultDocsRoot = resolve(REPO_ROOT, 'cross-cut-modules', 'docs', 'content', 'pages');

  return {
    async reindexDocs(reindexOpts = {}) {
      const docsRootDir = reindexOpts.docsRootDir ?? opts.docsRootDir ?? defaultDocsRoot;
      const corpusVersion = reindexOpts.version ?? docsCorpusVersion();
      const { pages } = await buildProductDocsIndex({ docsRootDir });

      let total = 0;
      let pageCount = 0;

      for (const page of pages) {
        if (shouldSkipSlug(page.slug)) continue;

        const loaded = await loadProductDocPage({ docsRootDir, slug: page.slug });
        if (!loaded.ok) continue;

        const body = formatDocIndexText(
          loaded.meta,
          loaded.markdown,
          page.slug,
          loaded.gated ?? page.gated,
        );
        if (!body.trim()) continue;

        const r = await indexWriter.indexChunksForParent({
          namespace: 'docs',
          parentId: `docs:${page.slug}`,
          date: DOCS_INDEX_DATE,
          body,
          sourceType: 'docs',
          title: page.title ?? page.slug,
          sourceUrl: page.canonical ?? null,
          kind: page.gated ? 'docs_gated' : 'docs_public',
          scopeId: corpusVersion,
        });
        total += r.chunks;
        pageCount++;
      }

      return { chunks: total, pages: pageCount, corpus_version: corpusVersion };
    },
  };
}

export { DOCS_INDEX_DATE, docsCorpusVersion };
