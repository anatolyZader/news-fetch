/**
 * Composition-root event handler registration.
 */

import { createLogger } from '../../log/index.js';
import { EVENT_TYPES } from '../domain/eventTypes.js';

const log = createLogger('events');

/**
 * @param {ReturnType<import('./inProcessEventBus.js').createInProcessEventBus>} bus
 * @param {object} [deps]
 * @param {import('../../../db/persistence/processedEventStore.js').ReturnType<import('../../../db/persistence/processedEventStore.js').createProcessedEventStore>} [deps.processedEvents]
 * @param {object} [deps.retrievalService]
 * @param {object} [deps.driftService]
 */
export function registerModuleHandlers(bus, deps = {}) {
  const processed = deps.processedEvents ?? null;

  async function runOnce(handlerId, eventType, aggregateId, fn) {
    if (processed && !processed.claim(eventType, aggregateId, handlerId)) {
      return;
    }
    await fn();
  }

  bus.subscribe(EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, async (payload) => {
    const aggregateId = `${payload.date ?? ''}:${payload.scope ?? 'national'}`;
    await runOnce('log', EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, aggregateId, async () => {
      log.info('resilience.report.written', payload.date, payload.scope);
    });
    if (deps.retrievalService?.indexReportForDate) {
      await runOnce('rag-index', EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, aggregateId, async () => {
        try {
          await deps.retrievalService.indexReportForDate(payload.date, payload.scope);
        } catch (err) {
          log.warn('rag index after report', err?.message ?? err);
        }
      });
    }
    if (deps.driftService?.recordSnapshot) {
      await runOnce('drift', EVENT_TYPES.RESILIENCE_REPORT_WRITTEN, aggregateId, async () => {
        try {
          deps.driftService.recordSnapshot({ date: payload.date, scope: payload.scope });
        } catch (err) {
          log.warn('drift snapshot', err?.message ?? err);
        }
      });
    }
  });

  bus.subscribe(EVENT_TYPES.EVIDENCE_SUBMISSION_COMPLETED, async (payload) => {
    const aggregateId = String(payload.submissionId ?? '');
    await runOnce('log', EVENT_TYPES.EVIDENCE_SUBMISSION_COMPLETED, aggregateId, async () => {
      log.info('evidence.submission.completed', payload.submissionId, payload.status);
    });
  });

  bus.subscribe(EVENT_TYPES.MAILING_DIGEST_REQUESTED, (payload) => {
    log.info('mailing.digest.requested', payload?.date);
  });

  bus.subscribe(EVENT_TYPES.PBO_REVIEW_INBOUND_RECEIVED, (payload) => {
    log.info('pbo.review.inbound.received', payload?.messageId);
  });
}
