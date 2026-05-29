import {
  normalizePboDistrictId,
  regionalSubregionsForDistrict,
  resolveRegionalInboxDir,
  listPboDistrictsForApi,
} from '../../../cross-cut-modules/pbo/pboDistrictRegistry.js';

function normalizeRegionId(districtId, regionId) {
  const district = normalizePboDistrictId(districtId);
  const id = String(regionId ?? '').trim().toLowerCase();
  const allowed = new Set(regionalSubregionsForDistrict(district));
  if (!id || !allowed.has(id)) {
    const err = new Error(`unknown regional PBO region "${id || '(empty)'}" for district "${district}"`);
    err.code = 'UNKNOWN_REGION';
    throw err;
  }
  return { districtId: district, regionId: id };
}

/**
 * Lists manually saved markdown reports for one regional PBO subregion within a home-front district.
 */
export function createPboRegionalDailyService({ repository, rootDir }) {
  if (!repository) throw new Error('repository is required');
  if (!rootDir) throw new Error('rootDir is required');

  return {
    listPboDistricts() {
      return { districts: listPboDistrictsForApi(rootDir) };
    },

    getRegionalPboReportDays(districtId, regionId) {
      const { districtId: district, regionId: region } = normalizeRegionId(districtId, regionId);
      const inboxDir = resolveRegionalInboxDir(rootDir, district);
      const inboxRelative = inboxDir.startsWith(rootDir)
        ? inboxDir.slice(rootDir.length).replace(/^[/\\]/, '')
        : inboxDir;
      return {
        districtId: district,
        regionId: region,
        inboxRelative,
        expectedPattern: `${inboxRelative}/<region>-YYYY-MM-DD.md`,
        days: repository.listReports({
          districtId: district,
          regionId: region,
          inboxDir,
          allowedRegionIds: regionalSubregionsForDistrict(district),
        }),
      };
    },
  };
}
