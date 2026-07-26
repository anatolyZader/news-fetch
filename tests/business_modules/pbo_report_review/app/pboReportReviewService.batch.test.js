import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPboReportReviewService } from '../../../../business_modules/pbo_report_review/app/pboReportReviewService.js';
import { createPboReviewSqliteStore } from '../../../../business_modules/pbo_report_review/infrastructure/adapters/pboReviewSqliteStore.js';
import { EVIDENCE_REQUIREMENTS } from '../../../../business_modules/report_build/domain/evidenceRequirements.js';
import { COMPONENTS_ORDER } from '../../../../business_modules/pbo_report/app/pboMunicipalityService.js';

function fullComponents(overrides = {}) {
  const components = {};
  for (const cid of COMPONENTS_ORDER) {
    const base = {
      avg: 0.5,
      scores: [{ value: 0.5 }, { value: 0.5 }, { value: 0.5 }],
      texts: ['ok'],
    };
    components[cid] = overrides[cid] ? { ...base, ...overrides[cid] } : base;
  }
  return components;
}

describe('pboReportReviewService batch export/send', () => {
  /** @type {string} */
  let dir;
  /** @type {ReturnType<typeof createPboReviewSqliteStore>} */
  let store;
  /** @type {Array<object>} */
  let sent;
  /** @type {ReturnType<typeof createPboReportReviewService>} */
  let service;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pbo-batch-'));
    store = createPboReviewSqliteStore(join(dir, 't.sqlite'));
    sent = [];

    const dashboard = {
      componentsOrder: COMPONENTS_ORDER,
      componentNames: { he: {}, en: {} },
      days: [{
        date: '2026-07-26',
        file: 'day.xlsx',
        municipalities: [
          {
            name: 'MuniA',
            components: fullComponents({
              narrative: { avg: null, scores: [], texts: [] },
            }),
          },
          {
            name: 'MuniB',
            components: fullComponents(),
          },
        ],
      }],
    };

    const officers = {
      MuniA: { email: 'a@example.com', language: 'he' },
      MuniB: { email: 'b@example.com', language: 'en' },
    };

    service = createPboReportReviewService({
      reviewStore: store,
      officerDirectory: { lookup: (name) => officers[name] ?? null },
      mailPort: {
        async sendMunicipalFollowUp(payload) {
          sent.push(payload);
          return { id: `msg-${sent.length}` };
        },
      },
      evidenceRequirements: EVIDENCE_REQUIREMENTS,
      getMunicipalityDashboard: () => dashboard,
      mailingConfigured: true,
      auditJsonlPath: join(dir, 'audit.jsonl'),
    });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exportDayBatch writes batch without sending mail', async () => {
    const outPath = join(dir, 'batch.json');
    const result = await service.exportDayBatch('2026-07-26', { outPath, repoRoot: dir });
    assert.equal(result.skipped, undefined);
    assert.ok(existsSync(outPath));
    assert.equal(sent.length, 0);
    const batch = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(batch.summary.total, 2);
    assert.equal(batch.summary.needsFeedback, 1);
    const a = batch.municipalities.find((m) => m.municipality === 'MuniA');
    assert.equal(a.send, true);
    assert.equal(a.officer.email, 'a@example.com');
    assert.ok(store.getReview('2026-07-26', 'MuniA')?.reviewToken);
  });

  it('sendDayFeedback dry-run selects overrides without sending', async () => {
    const outPath = join(dir, 'batch.json');
    await service.exportDayBatch('2026-07-26', { outPath, repoRoot: dir });
    const batch = JSON.parse(readFileSync(outPath, 'utf8'));
    batch.municipalities.find((m) => m.municipality === 'MuniA').officer.email = 'override@example.com';
    batch.municipalities.find((m) => m.municipality === 'MuniA').questions = [
      { gapId: 'x', text: 'Custom Q' },
    ];
    writeFileSync(outPath, JSON.stringify(batch));

    const result = await service.sendDayFeedback('2026-07-26', {
      batchPath: outPath,
      dryRun: true,
    });
    assert.equal(sent.length, 0);
    assert.equal(result.outcomes.length, 1);
    assert.equal(result.outcomes[0].dryRun, true);
    assert.equal(result.outcomes[0].to, 'override@example.com');
    assert.equal(result.outcomes[0].questionCount, 1);
  });

  it('sendDayFeedback marks emailSentAt and skips already-sent unless force', async () => {
    const outPath = join(dir, 'batch.json');
    await service.exportDayBatch('2026-07-26', { outPath, repoRoot: dir });

    const first = await service.sendDayFeedback('2026-07-26', { batchPath: outPath });
    assert.equal(first.outcomes[0].emailSent, true);
    assert.equal(sent.length, 1);
    assert.ok(store.getReview('2026-07-26', 'MuniA').emailSentAt);

    const second = await service.sendDayFeedback('2026-07-26', { batchPath: outPath });
    assert.equal(second.outcomes[0].emailSkipped, true);
    assert.match(second.outcomes[0].emailError, /already sent/);
    assert.equal(sent.length, 1);

    const forced = await service.sendDayFeedback('2026-07-26', { batchPath: outPath, force: true });
    assert.equal(forced.outcomes[0].emailSent, true);
    assert.equal(sent.length, 2);
  });

  it('sendDayFeedback skips gapsHash mismatch unless force', async () => {
    const outPath = join(dir, 'batch.json');
    await service.exportDayBatch('2026-07-26', { outPath, repoRoot: dir });
    const batch = JSON.parse(readFileSync(outPath, 'utf8'));
    batch.municipalities.find((m) => m.municipality === 'MuniA').gapsHash = 'stale-hash';
    writeFileSync(outPath, JSON.stringify(batch));

    const result = await service.sendDayFeedback('2026-07-26', { batchPath: outPath });
    assert.equal(result.outcomes[0].emailSkipped, true);
    assert.match(result.outcomes[0].emailError, /gapsHash mismatch/);
    assert.equal(sent.length, 0);

    const forced = await service.sendDayFeedback('2026-07-26', { batchPath: outPath, force: true });
    assert.equal(forced.outcomes[0].emailSent, true);
    assert.equal(sent.length, 1);
  });
});
