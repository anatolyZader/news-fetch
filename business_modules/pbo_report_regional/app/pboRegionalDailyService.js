import { basename, dirname, resolve } from 'path';
import { existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  COMPONENTS_ORDER,
  COMPONENT_NAMES_EN,
  COMPONENT_NAMES_HE,
  parsePboNorthExcelFile,
} from '../../pbo_report_muni/app/pboMunicipalityService.js';

const REGION_MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const REGIONAL_PBO_REGION_IDS = ['naftali', 'golan', 'baram', 'hiram', 'galma'];

const REGIONAL_PBO_SET = new Set(REGIONAL_PBO_REGION_IDS);

/** One number per municipality: mean of component avails; then mean across munis with data. */
function meanOfMunicipalityRollups(municipalities, order) {
  if (!municipalities?.length || !order?.length) return null;
  const vals = municipalities
    .map((m) => {
      const avgs = order.map((cid) => m.components?.[cid]?.avg).filter((v) => v != null);
      if (!avgs.length) return null;
      return avgs.reduce((a, b) => a + b, 0) / avgs.length;
    })
    .filter((v) => v != null);
  if (!vals.length) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10_000) / 10_000;
}

/**
 * Lists daily workbook files uploaded by each north regional PBO.
 * Expected layout: `business_modules/pbo_report_regional/<regionId>/*.xlsx`
 * Same sheet schema as municipality PBO (`parsePboNorthExcelFile`).
 *
 * @param {string} regionId naftali|golan|baram|hiram|galma
 */
export function getRegionalPboReportDays(regionId) {
  const id = String(regionId ?? '').trim().toLowerCase();
  if (!REGIONAL_PBO_SET.has(id)) {
    const err = new Error(`unknown regional PBO region: ${String(regionId ?? '').trim() || '(empty)'}`);
    err.code = 'UNKNOWN_REGION';
    throw err;
  }

  const inbox = resolve(REGION_MODULE_ROOT, id);
  const payload = {
    regionId: id,
    componentsOrder: COMPONENTS_ORDER,
    componentNames: { en: COMPONENT_NAMES_EN, he: COMPONENT_NAMES_HE },
    days: [],
  };

  if (!existsSync(inbox)) return payload;

  const filenames = readdirSync(inbox).filter((f) => f.endsWith('.xlsx')).sort();
  const days = [];

  for (const name of filenames) {
    const fullPath = resolve(inbox, name);
    let parsed = null;
    let parseThrown = null;
    try {
      parsed = parsePboNorthExcelFile(fullPath);
    } catch (e) {
      parseThrown = e?.message ?? String(e);
    }

    const munis = parsed?.municipalities ?? [];
    const parseOk = Boolean(munis.length);
    days.push({
      file: basename(name),
      inboxPath: `${id}/${basename(name)}`,
      date: parsed?.date ?? null,
      parseOk,
      parseError: parseThrown ?? (!parseOk ? 'empty_or_unknown_format' : null),
      municipalityCount: munis.length,
      meanScore: parseOk ? meanOfMunicipalityRollups(munis, COMPONENTS_ORDER) : null,
      municipalities: munis,
    });
  }

  days.sort((a, b) => {
    if (!a.date && !b.date) return a.file.localeCompare(b.file);
    if (!a.date) return 1;
    if (!b.date) return -1;
    const cmp = b.date.localeCompare(a.date);
    return cmp !== 0 ? cmp : a.file.localeCompare(b.file);
  });

  payload.days = days;
  return payload;
}
