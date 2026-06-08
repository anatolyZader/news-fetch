import { resolve } from 'node:path';
import { createWhatsAppMessageStore } from '../infrastructure/whatsappMessageStore.js';
import { createWhatsAppIngestService } from './whatsappIngestService.js';

/**
 * @param {string[]} [argv]
 */
export async function runWhatsAppToMdCli(argv = process.argv.slice(2)) {
  const getArg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };

  const date = getArg('--date') ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const sqlitePath = resolve(import.meta.dirname, '../../../db/app.sqlite');

  const messageStore = createWhatsAppMessageStore(sqlitePath);
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
}
