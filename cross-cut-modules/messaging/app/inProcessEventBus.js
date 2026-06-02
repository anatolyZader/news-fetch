/**
 * In-process pub/sub bus with AJV-validated payloads.
 */

import { validateEventPayload } from '../domain/eventSchemas.js';

/**
 * @typedef {(payload: object) => void | Promise<void>} EventHandler
 */

/**
 * @returns {{
 *   publish: (eventType: string, payload: object) => Promise<void>,
 *   subscribe: (eventType: string, handler: EventHandler) => () => void,
 * }}
 */
export function createInProcessEventBus() {
  /** @type {Map<string, Set<EventHandler>>} */
  const handlers = new Map();

  /**
   * @param {string} eventType
   * @param {object} payload
   */
  async function publish(eventType, payload) {
    validateEventPayload(eventType, payload);
    const subs = handlers.get(eventType);
    if (!subs || subs.size === 0) return;
    const errors = [];
    for (const handler of subs) {
      try {
        await handler(payload);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) {
      throw new AggregateError(errors, `Event ${eventType}: ${errors.length} handler(s) failed`);
    }
  }

  /**
   * @param {string} eventType
   * @param {EventHandler} handler
   * @returns {() => void} unsubscribe
   */
  function subscribe(eventType, handler) {
    if (!handlers.has(eventType)) handlers.set(eventType, new Set());
    handlers.get(eventType).add(handler);
    return () => handlers.get(eventType)?.delete(handler);
  }

  return { publish, subscribe };
}

/** @type {ReturnType<createInProcessEventBus> | null} */
let defaultBus = null;

export function getDefaultEventBus() {
  if (!defaultBus) defaultBus = createInProcessEventBus();
  return defaultBus;
}

export function setDefaultEventBus(bus) {
  defaultBus = bus;
}

export function resetDefaultEventBusForTests() {
  defaultBus = null;
}
