/**
 * STAGE 1 — closed-catalogue extraction.
 * Prompts the LLM with the fixed SIGNAL_CATALOG taxonomy, applies resilience-specific
 * hygiene, geo-attributes signals, and writes signals-{stem}-{date}.json.
 */
import { basename, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { extractSignals } from '../../infrastructure/claudeEvaluator.js';
import { stripTraceFields } from '../../infrastructure/claudeExtraction.js';
import { attributeSignalScope } from '../../../../cross-cut-modules/geo/attributeSignalScope.js';
import { attachSourceIdsToSignals } from '../../../../db/source_archive/attachSourceIds.js';
import { archiveArtifactBeforeWrite } from '../../../../cross-cut-modules/log/index.js';
import { closedSignalsDir } from '../../../../cross-cut-modules/resilience-contracts/index.js';
import { isVisitsSourceType, normalizeVisitsSourceType } from '../../domain/services/signals/visitsSourceType.js';
import { applyFieldReportSignalHygiene } from '../../domain/services/signals/fieldReportSignalHygiene.js';
import { applySignalTypeHygiene } from '../../domain/services/signals/signalTypeHygiene.js';

function attachArticleDatesToSignals(signals, articles) {
  return (signals ?? []).map((s) => {
    const idx = Number(s?.article_index);
    if (!Number.isFinite(idx) || idx <= 0) return s;
    const article = articles[idx - 1];
    const published = article?.publishedAt;
    if (!published) return s;
    const date = String(published).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return s;
    return { ...s, article_date: s.article_date ?? date };
  });
}

/**
 * Run the closed-catalogue extraction path: LLM with fixed SIGNAL_CATALOG,
 * hygiene, geo attribution, source-id/date stamping, trace-field strip, and
 * write of signals-{stem}-{date}.json.
 *
 * @param {{
 *   repoRoot: string,
 *   articles: Array<object>,
 *   sourceType: string,
 *   contentKind: string,
 *   date: string,
 *   filePaths: string[],
 *   onUsage: Function,
 *   retrievalService?: object|null,
 *   trace?: object|null,
 * }} opts
 * @returns {Promise<{ signals: Array<object>, bundleDistrictId: string|null }>}
 */
export async function runClosedCatalogueExtract(opts) {
  const {
    repoRoot,
    articles,
    sourceType,
    contentKind,
    date,
    filePaths,
    onUsage,
    retrievalService = null,
    trace = null,
  } = opts;

  let rawSignals = await extractSignals(articles, {
    onUsage,
    contentKind,
    retrievalService,
    reportDate: date,
    trace,
  });
  if (contentKind === 'field_report') {
    rawSignals = applyFieldReportSignalHygiene(rawSignals);
  } else {
    rawSignals = applySignalTypeHygiene(rawSignals);
  }
  const canonicalType = normalizeVisitsSourceType(sourceType);
  const bundleDistrictId = isVisitsSourceType(sourceType) || sourceType === 'whatsapp' ? 'north' : null;
  const { signals: attributed, attached, resolved, unknown } = attributeSignalScope(
    rawSignals.map((s) => ({ ...s, source_type: canonicalType })),
    {
      rootDir: repoRoot,
      sourceType: canonicalType,
      bundleDistrictId,
      unknownSourceType: `extract-${canonicalType}`,
    },
  );
  let signals = attributed;
  if (attached > 0) {
    console.error(`  → Geo attach: ${attached} signals, ${resolved} resolved, ${unknown} unknown`);
  }
  signals = attachSourceIdsToSignals(signals, filePaths, repoRoot);
  signals = attachArticleDatesToSignals(signals, articles);

  // Drop trace-only / rationale (B) fields so the persisted bundle and everything
  // downstream (assess/agent) stay clean.
  signals = signals.map(stripTraceFields);

  const outDir = isVisitsSourceType(sourceType)
    ? resolve('business_modules', 'visits', 'data', 'signals')
    : closedSignalsDir();
  mkdirSync(outDir, { recursive: true });
  const fileStem = isVisitsSourceType(sourceType) ? 'field' : canonicalType;
  const outPath = resolve(outDir, `signals-${fileStem}-${date}.json`);
  const archived = archiveArtifactBeforeWrite(outPath);
  if (archived) {
    console.error(`  → Prior closed bundle archived: ${archived}`);
  }
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        source_type: canonicalType,
        content_kind: contentKind,
        ...(bundleDistrictId ? { district_id: bundleDistrictId } : {}),
        date,
        extracted_at: new Date().toISOString(),
        source_files: filePaths.map((f) => basename(f)),
        total_articles: articles.length,
        signals,
      },
      null,
      2,
    ),
    'utf-8',
  );
  console.error(`\n→ ${signals.length} signals extracted`);
  console.error(`\nSignal file written: ${outPath}`);
  return { signals, bundleDistrictId };
}
