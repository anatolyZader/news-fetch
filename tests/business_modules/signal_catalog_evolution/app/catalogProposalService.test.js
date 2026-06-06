import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDraftProposalFromCluster } from '../../../../business_modules/signal_catalog_evolution/domain/services/draftProposalBuilder.js';
import { createCatalogProposalSqliteStore } from '../../../../business_modules/signal_catalog_evolution/infrastructure/adapters/catalogProposalSqliteStore.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('draftProposalBuilder', () => {
  it('maps cluster to proposal shape', () => {
    const proposal = buildDraftProposalFromCluster(
      { key: 'new_type', count: 3, sample_evidence: ['ev1'], related_types: ['fear'] },
      { suggested_signal_type: 'custom_fear', suggested_label: 'Custom fear' },
    );
    assert.equal(proposal.suggested_signal_type, 'custom_fear');
    assert.equal(proposal.capture_count, 3);
  });
});

describe('catalogProposalSqliteStore', () => {
  it('upserts and reviews proposals', () => {
    const dir = mkdtempSync(join(tmpdir(), 'catalog-prop-'));
    const store = createCatalogProposalSqliteStore(join(dir, 't.sqlite'));
    const id = store.upsertDraft({
      clusterKey: 'cluster-a',
      proposalJson: { suggested_signal_type: 'test_type' },
    });
    const list = store.list({ status: 'draft' });
    assert.ok(list.some((p) => p.id === id));
    const updated = store.updateReview(id, { status: 'approved', reviewer: 'a@test.com', note: 'ok' });
    assert.equal(updated.status, 'approved');
    rmSync(dir, { recursive: true, force: true });
  });
});
