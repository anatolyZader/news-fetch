import { enrichSignalsWithGeo } from './enrichSignalsWithGeo.js';
import {
  ISRAEL_REGIONAL_DISTRICT_ORDER,
  normalizeIsraelDistrictId,
} from './israelDistricts.js';
import { homeFrontDistrictIdsFromResolvedGeo } from '../../business_modules/geo/index.js';

/**
 * @param {object} signal
 * @returns {boolean}
 */
function hasValidExplicitDistrictId(signal) {
  const raw = signal?.district_id;
  if (raw == null || !String(raw).trim()) return false;
  const normalized = normalizeIsraelDistrictId(String(raw).trim());
  return ISRAEL_REGIONAL_DISTRICT_ORDER.includes(normalized);
}

/**
 * @param {object} signal
 * @param {string|null|undefined} bundleDistrictId
 * @returns {string|null}
 */
function deriveDistrictIdFromSignal(signal, bundleDistrictId) {
  if (hasValidExplicitDistrictId(signal)) {
    return normalizeIsraelDistrictId(String(signal.district_id).trim());
  }
  const fromGeo = homeFrontDistrictIdsFromResolvedGeo(signal?.geo);
  if (fromGeo.length > 0) return fromGeo[0];
  if (bundleDistrictId != null && String(bundleDistrictId).trim()) {
    const normalized = normalizeIsraelDistrictId(String(bundleDistrictId).trim());
    if (ISRAEL_REGIONAL_DISTRICT_ORDER.includes(normalized)) return normalized;
  }
  return null;
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
function signalNeedsAttribution(signal) {
  const needsGeo = !(signal && 'geo' in signal && signal.geo != null);
  const needsDistrict = !hasValidExplicitDistrictId(signal);
  return needsGeo || needsDistrict;
}

/**
 * Upstream scope attribution: resolve geo and stamp district_id before bundle persistence.
 * Does not apply default-north fallback (that remains in assess-time scope filtering).
 *
 * @param {object[]} signals
 * @param {{
 *   rootDir: string,
 *   sourceType?: string,
 *   bundleDistrictId?: string|null,
 *   reporterSubregionHint?: string,
 *   unknownSourceType?: string,
 * }} opts
 * @returns {{ signals: object[], attached: number, resolved: number, unknown: number, districtStamped: number }}
 */
export function attributeSignalScope(signals, opts = {}) {
  const list = Array.isArray(signals) ? signals : [];
  const {
    rootDir,
    sourceType,
    bundleDistrictId = null,
    reporterSubregionHint,
    unknownSourceType,
  } = opts;

  if (!rootDir) {
    throw new Error('attributeSignalScope: rootDir is required');
  }
  if (list.length === 0) {
    return { signals: list, attached: 0, resolved: 0, unknown: 0, districtStamped: 0 };
  }

  let working = list;
  let attached = 0;
  let resolved = 0;
  let unknown = 0;

  if (list.some(signalNeedsAttribution)) {
    const geoResult = enrichSignalsWithGeo(list, {
      rootDir,
      unknownSourceType: unknownSourceType ?? `attribute-${sourceType ?? 'signal'}`,
      reporterSubregionHint,
    });
    working = geoResult.signals;
    attached = geoResult.attached;
    resolved = geoResult.resolved;
    unknown = geoResult.unknown;
  }

  let districtStamped = 0;
  const out = working.map((s) => {
    if (!s || typeof s !== 'object') return s;
    const districtId = deriveDistrictIdFromSignal(s, bundleDistrictId);
    if (!districtId) return s;
    if (hasValidExplicitDistrictId(s)) {
      const normalized = normalizeIsraelDistrictId(String(s.district_id).trim());
      if (normalized === s.district_id) return s;
      districtStamped += 1;
      return { ...s, district_id: normalized };
    }
    districtStamped += 1;
    return { ...s, district_id: districtId };
  });

  return { signals: out, attached, resolved, unknown, districtStamped };
}
