import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  districtHasLocalPboData,
  listPboDistrictsForApi,
  normalizePboDistrictId,
  regionalSubregionsForDistrict,
  resetPboDistrictRegistryCache,
  resolveLocalExcelPaths,
} from '../../../cross-cut-modules/pbo/pboDistrictRegistry.js';

test('normalizePboDistrictId maps national to north', () => {
  resetPboDistrictRegistryCache();
  assert.equal(normalizePboDistrictId('national'), 'north');
  assert.equal(normalizePboDistrictId('south'), 'south');
});

test('north registry includes five regional subregions', () => {
  resetPboDistrictRegistryCache();
  assert.deepEqual(regionalSubregionsForDistrict('north'), [
    'naftali', 'golan', 'baram', 'hiram', 'galma',
  ]);
});

test('south registry has empty regional subregions until configured', () => {
  resetPboDistrictRegistryCache();
  assert.deepEqual(regionalSubregionsForDistrict('south'), []);
});

test('resolveLocalExcelPaths reads legacy north module root', () => {
  resetPboDistrictRegistryCache();
  const root = mkdtempSync(join(tmpdir(), 'pbo-root-'));
  try {
    mkdirSync(join(root, 'business_modules/pbo_report_muni'), { recursive: true });
    writeFileSync(join(root, 'business_modules/pbo_report_muni/north_1_2.xlsx'), 'x', 'utf8');
    const paths = resolveLocalExcelPaths(root, 'north');
    assert.equal(paths.length, 1);
    assert.match(paths[0], /north_1_2\.xlsx$/);
    assert.equal(districtHasLocalPboData(root, 'north'), true);
    assert.equal(districtHasLocalPboData(root, 'south'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('listPboDistrictsForApi exposes local and regional configuration', () => {
  resetPboDistrictRegistryCache();
  const root = mkdtempSync(join(tmpdir(), 'pbo-api-'));
  try {
    mkdirSync(join(root, 'business_modules/pbo_report_muni/data/south'), { recursive: true });
    writeFileSync(join(root, 'business_modules/pbo_report_muni/data/south/south_3_4.xlsx'), 'x', 'utf8');
    const { districts } = { districts: listPboDistrictsForApi(root) };
    const south = districts.find((d) => d.id === 'south');
    assert.ok(south);
    assert.equal(south.local.hasData, true);
    assert.equal(south.regional.configured, false);
    const north = districts.find((d) => d.id === 'north');
    assert.ok(north?.regional.configured);
    assert.equal(north.regional.subregions.length, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
