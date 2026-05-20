import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSearchTrendsService } from '../../../../business_modules/search_trends/app/searchTrendsService.js';

function mockPort() {
  const mkSeries = (keywords) => ({
    series: [
      { date: 'May 10, 2026', values: Object.fromEntries(keywords.map((k, i) => [k, 10 + i])) },
      { date: 'May 11, 2026', values: Object.fromEntries(keywords.map((k, i) => [k, 20 + i])) },
    ],
    keywords,
  });
  return {
    async interestOverTime({ keywords }) {
      return mkSeries(keywords);
    },
    async relatedQueries() {
      return {
        rising: [{ query: 'test rising', value: 100, formattedValue: '+50%' }],
        top: [{ query: 'test popular', value: 90, formattedValue: '90' }],
      };
    },
    async interestByRegion() {
      return [
        { geoCode: 'IL-Z', geoName: 'North', value: 80 },
        { geoCode: 'IL-D', geoName: 'South', value: 40 },
      ];
    },
  };
}

describe('searchTrendsService', () => {
  it('returns dashboard with topics and time series', async () => {
    const svc = createSearchTrendsService({
      trendsPort: mockPort(),
      cache: { async read() { return null; }, async write() {} },
      useLive: true,
    });
    const data = await svc.getDashboard({ districtId: 'national', days: 7 });
    assert.equal(data.district.id, 'national');
    assert.equal(data.source, 'live');
    assert.ok(Array.isArray(data.topics) && data.topics.length >= 5);
    assert.ok(Array.isArray(data.timeSeries) && data.timeSeries.length >= 2);
    assert.ok(data.topics[0].latest >= 0);
    assert.equal(data.popularQueries[0].query, 'test popular');
    assert.equal(data.risingQueries[0].query, 'test rising');
    assert.equal(data.relatedSeedLabelKey, 'trends.topic.alerts');
    assert.ok(data.analytics?.attention?.index >= 0);
    assert.ok(Array.isArray(data.analytics?.components));
    assert.ok(data.analytics?.queriesIntel?.popularByGroup);
  });

  it('lists districts', () => {
    const svc = createSearchTrendsService({ useLive: false });
    const districts = svc.listDistricts();
    assert.ok(districts.some((d) => d.id === 'north'));
    assert.ok(districts.some((d) => d.id === 'dan'));
    assert.ok(!districts.some((d) => d.id === 'tel_aviv'));
    assert.ok(districts.some((d) => d.id === 'national'));
  });

  it('warmCache refreshes all district × window combos', async () => {
    let calls = 0;
    const svc = createSearchTrendsService({
      trendsPort: mockPort(),
      cache: { async read() { return null; }, async write() {} },
      useLive: true,
    });
    const orig = svc.getDashboard.bind(svc);
    svc.getDashboard = async (opts) => {
      calls += 1;
      return orig(opts);
    };
    const summary = await svc.warmCache({ delayMs: 0 });
    assert.equal(summary.total, 21);
    assert.equal(summary.ok, 21);
    assert.equal(calls, 21);
  });
});
