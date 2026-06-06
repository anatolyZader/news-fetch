/**
 * Port for catalog proposal persistence.
 */
export class ICatalogProposalPort {
  upsertDraft(_row) {
    throw new Error('not implemented');
  }

  list(_opts) {
    throw new Error('not implemented');
  }

  getById(_id) {
    throw new Error('not implemented');
  }

  updateReview(_id, _update) {
    throw new Error('not implemented');
  }
}
