import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogProposalDraft } from '../../../../../business_modules/signal_catalog_evolution/domain/value_objects/catalogProposalDraft.js';

describe('CatalogProposalDraft VO', () => {
  it('transitions draft to approved', () => {
    const draft = new CatalogProposalDraft({ status: 'draft', proposalJson: { type: 'x' } });
    const approved = draft.transitionTo('approved', { reviewer: 'alice', note: 'ok' });
    assert.equal(approved.status, 'approved');
    assert.equal(approved.reviewer, 'alice');
  });

  it('rejects invalid transition from approved', () => {
    const draft = new CatalogProposalDraft({ status: 'approved' });
    assert.throws(() => draft.transitionTo('dismissed'));
  });
});
