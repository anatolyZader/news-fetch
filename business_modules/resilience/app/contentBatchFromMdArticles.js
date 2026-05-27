/**
 * Build a ResilienceContentBatch from articles produced by loadMdFiles() (infrastructure/mdReportsLoader.js).
 * Host stays responsible for discovering MD paths and calling loadMdFiles.
 *
 * @param {Array<{ title: string, url?: string, publishedAt?: string, source?: string, body: string, sourceFile: string }>} rawArticles
 * @param {{ reportDate: string, contentKind?: 'news'|'audio', priorAssessments?: object[], sourceRunId?: string }} meta
 */
export function contentBatchFromMdArticles(rawArticles, meta) {
  const { reportDate, contentKind = 'news', priorAssessments, sourceRunId } = meta;
  return {
    reportDate,
    contentKind,
    ...(priorAssessments != null ? { priorAssessments } : {}),
    ...(sourceRunId != null ? { sourceRunId } : {}),
    items: rawArticles.map((a, i) => ({
      id: `${a.sourceFile}#${i}`,
      title: a.title,
      body: a.body,
      ...(a.url ? { url: a.url } : {}),
      ...(a.publishedAt ? { publishedAt: a.publishedAt } : {}),
      ...(a.source ? { sourceLabel: a.source } : {}),
      temporal_weight: a.temporal_weight ?? 1,
    })),
  };
}
