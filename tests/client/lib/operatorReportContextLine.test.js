import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveOperatorReportContext,
  formatOperatorContextTemplate,
} from '../../../client/src/lib/operatorReportContextLine.js';

describe('operatorReportContextLine', () => {
  it('deriveOperatorReportContext reads void, mode, and scope signals', () => {
    const ctx = deriveOperatorReportContext({
      report_scope: { label: 'North' },
      data_void: { level: 'elevated' },
      narrative_pipeline_mode: 'hybrid',
      investigation_summary: { signals_narrative_scope: 42 },
    });
    assert.equal(ctx.scopeLabel, 'North');
    assert.equal(ctx.voidLevel, 'elevated');
    assert.equal(ctx.narrativeMode, 'hybrid');
    assert.equal(ctx.scopeSignalCount, 42);
  });

  it('formatOperatorContextTemplate substitutes placeholders', () => {
    const line = formatOperatorContextTemplate(
      '{scope} · void {voidLevel} · narrative {narrativeMode} · {n} scope signals',
      { scope: 'North', voidLevel: 'none', narrativeMode: 'agent', n: 10 },
    );
    assert.equal(line, 'North · void none · narrative agent · 10 scope signals');
  });
});
