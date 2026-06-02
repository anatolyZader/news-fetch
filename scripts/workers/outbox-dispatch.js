#!/usr/bin/env node
/**
 * Worker: drain transactional outbox into the in-process event bus.
 */
import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOutboxStore } from '../../db/persistence/outboxStore.js';
import { getDefaultEventBus, registerModuleHandlers } from '../../cross-cut-modules/messaging/index.js';
import { dispatchOutboxBatch } from '../../cross-cut-modules/messaging/app/outboxDispatcher.js';
import { wireApplication } from '../../composition/wireApplication.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const w = wireApplication();
const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(repoRoot, 'db', 'app.sqlite');

const outbox = createOutboxStore(sqlitePath);
const bus = getDefaultEventBus();
registerModuleHandlers(bus, {
  processedEvents: w.processedEventStore,
  retrievalService: w.retrievalService,
});

const intervalMs = Number(process.env.OUTBOX_DISPATCH_INTERVAL_MS || 5000);
console.log(`[worker:outbox] draining every ${intervalMs}ms`);

async function tick() {
  await dispatchOutboxBatch(outbox, bus);
}

await tick();
setInterval(() => {
  void tick();
}, intervalMs);
