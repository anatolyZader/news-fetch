export class IVisitsRepositoryPort {
  constructor() {
    if (new.target === IVisitsRepositoryPort) {
      throw new Error('IVisitsRepositoryPort is abstract');
    }
  }

  listVisitDays() {
    throw new Error('listVisitDays() must be implemented');
  }
}
