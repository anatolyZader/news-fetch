import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFallbackTrendsPort } from '../../../../business_modules/search_trends/infrastructure/adapters/createTrendsPort.js';

describe('createFallbackTrendsPort', () => {
  it('falls back to secondary port when primary method throws', async () => {
    const end = new Date('2026-05-18T12:00:00Z');
    const start = new Date('2026-05-15T12:00:00Z');
    const opts = {
      keywords: ['test'],
      geo: 'IL',
      startTime: start,
      endTime: end,
    };

    const primary = {
      interestOverTime: async () => {
        throw new Error('Payment Required.');
      },
      relatedQueries: async () => {
        throw new Error('Payment Required.');
      },
      interestByRegion: async () => {
        throw new Error('Payment Required.');
      },
    };

    const fallback = {
      interestOverTime: async () => ({ series: [{ date: '2026-05-18', values: { test: 50 } }], keywords: ['test'] }),
      relatedQueries: async () => ({ rising: [], top: [] }),
      interestByRegion: async () => [{ geoCode: 'IL-Z', geoName: 'North', value: 80 }],
    };

    const port = createFallbackTrendsPort(primary, fallback);
    const out = await port.interestOverTime(opts);
    assert.equal(out.series[0].values.test, 50);
  });
});
