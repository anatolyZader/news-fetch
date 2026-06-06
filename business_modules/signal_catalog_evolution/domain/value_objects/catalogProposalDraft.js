const VALID_STATUSES = new Set(['draft', 'approved', 'dismissed', 'reviewed']);

/**
 * Catalog proposal draft lifecycle helpers.
 */
export class CatalogProposalDraft {
  /**
   * @param {{ id?: string, status: string, proposalJson?: object, reviewer?: string, note?: string }} fields
   */
  constructor(fields) {
    this.id = fields.id ?? null;
    this.status = fields.status ?? 'draft';
    this.proposalJson = fields.proposalJson ?? {};
    this.reviewer = fields.reviewer ?? null;
    this.note = fields.note ?? null;
  }

  static fromRecord(record) {
    if (!record) return new CatalogProposalDraft({ status: 'draft' });
    return new CatalogProposalDraft({
      id: record.id,
      status: record.status ?? 'draft',
      proposalJson: record.proposal_json ?? record.proposalJson ?? {},
      reviewer: record.reviewer,
      note: record.note,
    });
  }

  /** @param {'approved'|'dismissed'|'reviewed'} nextStatus */
  transitionTo(nextStatus, { reviewer, note } = {}) {
    if (!VALID_STATUSES.has(nextStatus)) {
      throw new Error(`invalid catalog proposal status: ${nextStatus}`);
    }
    if (this.status !== 'draft' && nextStatus !== 'reviewed') {
      throw new Error(`cannot transition from ${this.status} to ${nextStatus}`);
    }
    return new CatalogProposalDraft({
      ...this,
      status: nextStatus,
      reviewer: reviewer ?? this.reviewer,
      note: note ?? this.note,
    });
  }
}
