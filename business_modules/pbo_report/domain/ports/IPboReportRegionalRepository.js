export class IPboReportRegionalRepository {
  constructor() {
    if (new.target === IPboReportRegionalRepository) {
      throw new Error('IPboReportRegionalRepository is abstract');
    }
  }

  listReports() {
    throw new Error('listReports() must be implemented');
  }
}
