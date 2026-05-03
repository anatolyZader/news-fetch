import { REGIONAL_PBO_REGION_SET } from '../domain/value_objects/regionalPboRegions.js';

function normalizeRegionId(regionId) {
  const id = String(regionId ?? '').trim().toLowerCase();
  if (!REGIONAL_PBO_REGION_SET.has(id)) {
    const err = new Error(`unknown regional PBO region: ${id || '(empty)'}`);
    err.code = 'UNKNOWN_REGION';
    throw err;
  }
  return id;
}

/**
 * Lists manually saved markdown reports for one north regional PBO.
 * Expected layout: `business_modules/pbo_report_regional/data/*.md`
 * One file per region per day, with either frontmatter or a filename that
 * identifies the region and date.
 */
export function createPboRegionalDailyService({ repository }) {
  if (!repository) throw new Error('repository is required');

  return {
    getRegionalPboReportDays(regionId) {
      const id = normalizeRegionId(regionId);
      return {
        regionId: id,
        inboxRelative: 'business_modules/pbo_report_regional/data',
        expectedPattern: 'business_modules/pbo_report_regional/data/<region>-YYYY-MM-DD.md',
        days: repository.listReports({ regionId: id }),
      };
    },
  };
}
