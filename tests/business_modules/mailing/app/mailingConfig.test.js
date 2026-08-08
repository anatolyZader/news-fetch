import { describe, it } from 'node:test';
import assert from 'node:assert';

import { resolveDigestReportConfig } from '../../../../business_modules/mailing/app/mailingConfig.js';
import { isMailingConfigured } from '../../../../cross-cut-modules/config/mailingEnv.js';

describe('resolveDigestReportConfig', () => {
  it('defaults to the temporary north / latest_generated preference', () => {
    const cfg = resolveDigestReportConfig({});
    assert.strictEqual(cfg.scope, 'north');
    assert.strictEqual(cfg.selection, 'latest_generated');
    assert.strictEqual(cfg.scopeCoerced, false);
    assert.strictEqual(cfg.selectionCoerced, false);
  });

  it('accepts an explicit scope, trimming and lowercasing', () => {
    assert.strictEqual(resolveDigestReportConfig({ MAIL_DIGEST_REPORT_SCOPE: 'national' }).scope, 'national');
    const padded = resolveDigestReportConfig({ MAIL_DIGEST_REPORT_SCOPE: ' NORTH ' });
    assert.strictEqual(padded.scope, 'north');
    assert.strictEqual(padded.scopeCoerced, false);
  });

  it('flags a typo instead of silently degrading to national', () => {
    const cfg = resolveDigestReportConfig({ MAIL_DIGEST_REPORT_SCOPE: 'nroth' });
    assert.strictEqual(cfg.scope, 'national');
    assert.strictEqual(cfg.scopeRaw, 'nroth');
    assert.strictEqual(cfg.scopeCoerced, true);
  });

  it('honours latest_date and flags an unknown selection', () => {
    assert.strictEqual(
      resolveDigestReportConfig({ MAIL_DIGEST_REPORT_SELECTION: 'latest_date' }).selection,
      'latest_date',
    );
    const bad = resolveDigestReportConfig({ MAIL_DIGEST_REPORT_SELECTION: 'garbage' });
    assert.strictEqual(bad.selection, 'latest_generated');
    assert.strictEqual(bad.selectionCoerced, true);
  });

  it('treats an empty value as unset', () => {
    const cfg = resolveDigestReportConfig({ MAIL_DIGEST_REPORT_SCOPE: '   ' });
    assert.strictEqual(cfg.scope, 'north');
    assert.strictEqual(cfg.scopeCoerced, false);
  });
});

describe('isMailingConfigured', () => {
  const full = { RESEND_API_KEY: 're_abc', MAIL_FROM: 'Srulik <noreply@srulik.ai>' };

  it('requires both key and from', () => {
    assert.strictEqual(isMailingConfigured(full), true);
    assert.strictEqual(isMailingConfigured({ RESEND_API_KEY: 're_abc' }), false);
    assert.strictEqual(isMailingConfigured({ MAIL_FROM: 'a@b.c' }), false);
    assert.strictEqual(isMailingConfigured({}), false);
  });

  it('treats whitespace-only values as unset', () => {
    assert.strictEqual(isMailingConfigured({ RESEND_API_KEY: '  ', MAIL_FROM: 'a@b.c' }), false);
  });

  it('honours the MAILING_ENABLED kill switch', () => {
    assert.strictEqual(isMailingConfigured({ ...full, MAILING_ENABLED: 'false' }), false);
    assert.strictEqual(isMailingConfigured({ ...full, MAILING_ENABLED: 'off' }), false);
    assert.strictEqual(isMailingConfigured({ ...full, MAILING_ENABLED: '0' }), false);
    assert.strictEqual(isMailingConfigured({ ...full, MAILING_ENABLED: 'true' }), true);
  });
});
