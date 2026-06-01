/**
 * Orchestrate open extraction and persistence.
 */
import { basename } from 'node:path';
import { normalizeObservations } from '../domain/services/observationSchema.js';
import { AnthropicOpenExtractionAdapter } from '../infrastructure/adapters/anthropicOpenExtractionAdapter.js';
import { ObservationFsAdapter } from '../infrastructure/adapters/observationFsAdapter.js';

/**
 * @param {{
 *   extractionPort: import('../domain/ports/IOpenExtractionPort.js').IOpenExtractionPort,
 *   storePort: import('../domain/ports/IObservationStorePort.js').IObservationStorePort,
 * }} deps
 */
export function createSignalsExtractionService({ extractionPort, storePort }) {
  if (!extractionPort || !storePort) {
    throw new Error('signalsExtractionService: extractionPort and storePort are required');
  }

  return {
    /**
     * @param {Array<object>} articles
     * @param {{
     *   profile: string,
     *   date: string,
     *   contentKind?: string,
     *   sourceType?: string,
     *   sourceFiles?: string[],
     *   onUsage?: Function,
     * }} opts
     */
    async extractAndSave(articles, opts) {
      const profile = opts.profile ?? 'exploratory';
      const observations = await extractionPort.extractObservations(articles, {
        profile,
        onUsage: opts.onUsage,
        batchLabel: `observations-${profile}-${opts.date}`,
      });

      const bundle = {
        profile,
        content_kind: opts.contentKind ?? 'mixed',
        source_type: opts.sourceType ?? 'adhoc',
        date: opts.date,
        extracted_at: new Date().toISOString(),
        source_files: (opts.sourceFiles ?? []).map((f) => basename(f)),
        total_articles: articles.length,
        observations,
      };

      const path = storePort.writeBundle(bundle);
      return { path, bundle, observationCount: observations.length };
    },

    /**
     * Residual pass for zero-signal articles (catalog learning).
     * @param {Array<object>} articles
     * @param {{ date: string, batchLabel?: string, onUsage?: Function }} opts
     */
    async extractResidual(articles, opts) {
      if (!articles.length) return { observations: [], bundle: null, path: null };

      const raw = await extractionPort.extractObservations(articles, {
        profile: 'residual',
        onUsage: opts.onUsage,
        batchLabel: opts.batchLabel ?? 'residual-capture',
      });

      const observations = normalizeObservations(raw);
      const bundle = {
        profile: 'residual',
        content_kind: 'mixed',
        source_type: 'residual',
        date: opts.date,
        extracted_at: new Date().toISOString(),
        source_files: [],
        total_articles: articles.length,
        observations,
      };

      let path = null;
      if (observations.length > 0) {
        path = storePort.writeBundle(bundle);
      }

      return { observations, bundle, path };
    },

    listBundles(opts) {
      return storePort.listBundles(opts);
    },

    loadBundle(filename) {
      return storePort.loadBundle(filename);
    },
  };
}

/**
 * Factory with default adapters.
 */
export function createDefaultSignalsExtractionService(opts = {}) {
  return createSignalsExtractionService({
    extractionPort: opts.extractionPort ?? new AnthropicOpenExtractionAdapter(opts),
    storePort: opts.storePort ?? new ObservationFsAdapter(opts),
  });
}
