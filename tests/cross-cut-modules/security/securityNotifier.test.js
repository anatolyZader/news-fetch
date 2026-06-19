import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, beforeEach, afterEach } from 'node:test';
import {
  formatSecurityTelegramMessage,
  notifySecurityEvent,
  sendTelegramSecurityAlert,
  shouldNotifyTelegram,
} from '../../../cross-cut-modules/security/app/securityNotifier.js';
import { resolveAuditLogPath } from '../../../cross-cut-modules/security/input/auditLog.js';

describe('securityNotifier', () => {
  let tempDir;
  let auditPath;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'sec-notify-'));
    auditPath = join(tempDir, 'audit.jsonl');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('shouldNotifyTelegram is true for warning and critical only', () => {
    assert.equal(shouldNotifyTelegram('info'), false);
    assert.equal(shouldNotifyTelegram('warning'), true);
    assert.equal(shouldNotifyTelegram('critical'), true);
  });

  it('formatSecurityTelegramMessage includes tier label and summary', () => {
    const msg = formatSecurityTelegramMessage({
      tier: 'critical',
      action: 'integrity.drift',
      summary: '2 files drifted',
      meta: { count: 2 },
    });
    assert.match(msg, /\[CRITICAL\] integrity\.drift/);
    assert.match(msg, /2 files drifted/);
  });

  it('notifySecurityEvent writes audit log and skips telegram without secrets', async () => {
    const result = await notifySecurityEvent({
      tier: 'info',
      action: 'security.test',
      summary: 'hello',
      auditLogPath: auditPath,
      env: {},
    });

    assert.equal(result.auditLogged, true);
    assert.equal(result.telegramSent, false);

    const lines = readFileSync(auditPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]);
    assert.equal(row.action, 'security.test');
    assert.equal(row.severity, 'info');
    assert.equal(row.meta.summary, 'hello');
  });

  it('notifySecurityEvent sends telegram when configured', async () => {
    /** @type {RequestInit | undefined} */
    let capturedInit;
    const fetchImpl = async (_url, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const result = await notifySecurityEvent({
      tier: 'warning',
      action: 'supply-chain.new_dep',
      summary: 'new package added',
      auditLogPath: auditPath,
      env: {
        TELEGRAM_BOT_TOKEN: 'test-token',
        TELEGRAM_SECURITY_CHAT_ID: '12345',
      },
      fetchImpl,
    });

    assert.equal(result.telegramSent, true);
    assert.ok(capturedInit?.body);
    const body = JSON.parse(String(capturedInit.body));
    assert.equal(body.chat_id, '12345');
    assert.match(body.text, /\[WARNING\]/);
  });

  it('sendTelegramSecurityAlert returns false when secrets unset', async () => {
    const sent = await sendTelegramSecurityAlert('test', {}, async () => {
      throw new Error('fetch should not be called');
    });
    assert.equal(sent, false);
  });
});
