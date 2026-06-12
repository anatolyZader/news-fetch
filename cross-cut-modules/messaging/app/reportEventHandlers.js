/**
 * Chain of Responsibility handlers for RESILIENCE_REPORT_WRITTEN.
 * Each handler declares what deps it needs (canHandle) and what it does (handle).
 * New side effects are added here without touching registerModuleHandlers.
 *
 * @typedef {{ id: string, canHandle(deps: object): boolean, handle(payload: object, deps: object): Promise<void> }} ReportWrittenHandler
 */

import { createLogger } from '../../log/index.js';

const log = createLogger('events');

/** @type {ReportWrittenHandler[]} */
export const REPORT_WRITTEN_HANDLERS = [
  {
    id: 'log',
    canHandle: () => true,
    async handle(payload) {
      log.info('resilience.report.written', payload.date, payload.scope);
    },
  },
  {
    id: 'rag-index',
    canHandle: (deps) => Boolean(deps.retrievalService?.indexReportForDate),
    async handle(payload, deps) {
      try {
        await deps.retrievalService.indexReportForDate(payload.date, payload.scope);
      } catch (err) {
        log.warn('rag index after report', err?.message ?? err);
      }
    },
  },
  {
    id: 'drift',
    canHandle: (deps) => Boolean(deps.driftService?.recordSnapshot),
    async handle(payload, deps) {
      try {
        deps.driftService.recordSnapshot({ date: payload.date, scope: payload.scope });
      } catch (err) {
        log.warn('drift snapshot', err?.message ?? err);
      }
    },
  },
];
