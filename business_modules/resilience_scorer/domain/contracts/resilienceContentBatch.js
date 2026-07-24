/**
 * Pure validation for ResilienceContentBatch ingest payloads (client-safe contract).
 *
 * Pipeline position: extract/ingest — validates news/audio content batches before signal extraction.
 *
 * Owns: ResilienceContentBatch shape assertions (reportDate, contentKind, items).
 * Does NOT: signal extraction, catalogue validation, or resilience assessment output.
 *
 * Key collaborators: composition/registerIngestion.js, app/extraction/, app/resilienceAnalysisService.js.
 *
 * @see docs/specs/resilience-business-module.md
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Assert that a value conforms to ResilienceContentBatch; throws on invalid shape.
 *
 * @param {unknown} batch
 * @throws {Error} with message containing field hint
 */
export function assertValidResilienceContentBatch(batch) {
  if (batch == null || typeof batch !== 'object') {
    throw new Error('batch required');
  }
  const { reportDate, contentKind, items } = batch;
  if (!reportDate || typeof reportDate !== 'string' || !DATE_RE.test(reportDate)) {
    throw new Error('invalid reportDate (expected YYYY-MM-DD)');
  }
  if (contentKind !== 'news' && contentKind !== 'audio') {
    throw new Error('invalid contentKind (expected news or audio)');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items must be a non-empty array');
  }
  for (const item of items) {
    if (item == null || typeof item !== 'object') {
      throw new Error('each item must be an object');
    }
    if (!item.id || typeof item.id !== 'string') {
      throw new Error('each item requires string id');
    }
    if (!item.title || typeof item.title !== 'string') {
      throw new Error('each item requires string title');
    }
    if (item.body == null || typeof item.body !== 'string') {
      throw new Error('each item requires string body');
    }
  }
}
