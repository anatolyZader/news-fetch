import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  buildOmissionAuditPayload,
  buildAndWriteOmissionAudit,
} from '../../../../business_modules/resilience_scorer/app/omissionAuditService.js';
import { LEARNING_CAPTURE_KINDS } from '../../../../cross-cut-modules/learningCapture/kinds.js';

describe('omissionAuditService', () => {
  it('builds payload from OOV JSONL and closed signal diff', () => {
    const reportsDir = mkdtempSync(join(tmpdir(), 'omission-audit-'));
    const date = '2026-04-09';
    const lines = [
      JSON.stringify({
        capture_kind: LEARNING_CAPTURE_KINDS.ZERO_SIGNAL_ARTICLE,
        article_index: 2,
        timestamp: `${date}T10:00:00.000Z`,
      }),
      JSON.stringify({
        capture_kind: LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION,
        evidence: 'novel shelter behavior',
        novelty_hint: 'high',
        nearest_existing_types: ['shelter_avoidance'],
        timestamp: `${date}T10:01:00.000Z`,
      }),
    ];
    writeFileSync(join(reportsDir, `oov-capture-${date}.jsonl`), `${lines.join('\n')}\n`);

    const payload = buildOmissionAuditPayload({
      date,
      reportScopeId: 'north',
      closedSignals: [{ signal_type: 'information_clarity' }],
      reportsDir,
    });

    assert.equal(payload.zero_signal_article_count, 1);
    assert.equal(payload.residual_observation_count, 1);
    assert.equal(payload.high_novelty_observations.length, 1);
    assert.ok(payload.suggested_catalog_types_missing_from_closed.includes('shelter_avoidance'));
    assert.ok(payload.attention_items.some((a) => a.includes('catalogue gap')));
  });

  it('writes omission-audit artifact file', () => {
    const reportsDir = mkdtempSync(join(tmpdir(), 'omission-audit-write-'));
    const date = '2026-04-09';
    mkdirSync(reportsDir, { recursive: true });
    writeFileSync(join(reportsDir, `oov-capture-${date}.jsonl`), '\n');

    const { path, summary } = buildAndWriteOmissionAudit({
      date,
      reportScopeId: 'north',
      closedSignals: [],
      reportsDir,
    });

    assert.match(path, /omission-audit-north-2026-04-09\.json$/);
    const written = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(written.scope, 'north');
    assert.equal(summary.artifact_path, path);
  });
});
