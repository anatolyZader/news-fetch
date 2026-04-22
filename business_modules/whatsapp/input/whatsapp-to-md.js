#!/usr/bin/env node
/**
 * CLI: Export accumulated WhatsApp messages for a date to a markdown file
 * compatible with the resilience signal extraction pipeline.
 *
 * Usage:
 *   node whatsapp-to-md.js --date YYYY-MM-DD
 *
 * Output:
 *   business_modules/whatsapp/reports/whatsapp_reports-{date}.md
 */

import 'dotenv/config';
import { resolve } from 'path';
import { createWhatsAppMessageStore } from '../infrastructure/whatsappMessageStore.js';
import { createWhatsAppIngestService } from '../app/whatsappIngestService.js';

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const date = getArg('--date') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const sqlitePath = resolve(import.meta.dirname, '../../../data/app.sqlite');

const messageStore = createWhatsAppMessageStore(sqlitePath);

// Only need messageStore for export — apiAdapter and evidenceStore not used
const ingestService = createWhatsAppIngestService({
  messageStore,
  apiAdapter: null,
  evidenceStore: null,
  allowedGroupIds: [],
});

const outPath = ingestService.exportToMarkdown(date);
if (outPath) {
  console.log(outPath);
}
