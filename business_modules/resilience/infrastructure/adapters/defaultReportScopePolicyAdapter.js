import {
  filterSignalsForScope,
  normalizeReportScope,
} from '../../domain/services/regionSignalFilter.js';

/** Default scope policy delegating to regionSignalFilter. */
export function createDefaultReportScopePolicy() {
  return {
    filterSignalsForScope,
    normalizeReportScope,
  };
}
