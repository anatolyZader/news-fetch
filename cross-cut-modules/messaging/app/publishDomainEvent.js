import { getDefaultEventBus } from './inProcessEventBus.js';

/**
 * Publish via outbox when store is provided (same-transaction writes), else in-process bus.
 *
 * @param {object} opts
 * @param {string} opts.eventType
 * @param {object} opts.payload
 * @param {import('../../../db/persistence/outboxStore.js').ReturnType<import('../../../db/persistence/outboxStore.js').createOutboxStore>} [opts.outbox]
 * @param {{ publish: (t: string, p: object) => Promise<void> }} [opts.bus]
 */
export async function publishDomainEvent({ eventType, payload, outbox = null, bus = null }) {
  const enriched = { eventVersion: 1, ...payload };
  if (outbox) {
    outbox.enqueue(eventType, enriched);
    return;
  }
  const target = bus ?? getDefaultEventBus();
  await target.publish(eventType, enriched);
}
