import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createWhatsAppMessageStore } from '../../../../business_modules/whatsapp/infrastructure/whatsappMessageStore.js';

describe('whatsappMessageStore idempotency', () => {
  /** @type {string} */
  let dbPath;
  /** @type {string} */
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wa-test-'));
    dbPath = join(dir, 'wa.sqlite');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('insert returns false for duplicate meta_msg_id', () => {
    const store = createWhatsAppMessageStore(dbPath);
    const row = {
      metaMsgId: 'wamid.abc',
      groupJid: 'g1',
      senderPhone: '+1',
      senderName: 'Test',
      messageText: 'hi',
      timestampUtc: '2026-01-01T00:00:00Z',
      date: '2026-01-01',
    };
    assert.equal(store.insert(row), true);
    assert.equal(store.insert(row), false);
    assert.equal(store.hasMsgId('wamid.abc'), true);
  });
});
