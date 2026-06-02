import { createLogger } from '../../log/index.js';

const log = createLogger('outbox');

/**
 * @param {import('../../../db/persistence/outboxStore.js').ReturnType<createOutboxStore>} outbox
 * @param {{ publish: (type: string, payload: object) => Promise<void> }} bus
 */
export async function dispatchOutboxBatch(outbox, bus) {
  const pending = outbox.listPending(25);
  for (const row of pending) {
    try {
      await bus.publish(row.eventType, row.payload);
      outbox.markProcessed(row.id);
    } catch (err) {
      log.warn('outbox dispatch failed', row.id, err?.message ?? err);
    }
  }
}
