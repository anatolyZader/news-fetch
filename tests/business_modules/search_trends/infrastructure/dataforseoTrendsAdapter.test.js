import { describe, it, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createDataforseoTrendsAdapter,
  dataforseoTaskTiming,
} from '../../../../business_modules/search_trends/infrastructure/adapters/dataforseoTrendsAdapter.js';

describe('dataforseoTrendsAdapter', () => {
  afterEach(() => {
    mock.restoreAll();
    delete process.env.DATAFORSEO_LOGIN;
    delete process.env.DATAFORSEO_PASSWORD;
  });

  it('returns null without credentials', () => {
    assert.equal(createDataforseoTrendsAdapter(), null);
  });

  it('maps day windows to time_range or dates', () => {
    assert.deepEqual(dataforseoTaskTiming(1), { time_range: 'past_day' });
    assert.deepEqual(dataforseoTaskTiming(7), { time_range: 'past_7_days' });
    const three = dataforseoTaskTiming(3, new Date('2026-05-18T12:00:00Z'));
    assert.equal(three.date_from, '2026-05-15');
    assert.equal(three.date_to, '2026-05-18');
  });

  it('parses interestOverTime from live explore response', async () => {
    process.env.DATAFORSEO_LOGIN = 'user';
    process.env.DATAFORSEO_PASSWORD = 'pass';

    mock.method(globalThis, 'fetch', async () => ({
      ok: true,
      json: async () => ({
        status_code: 20000,
        tasks: [
          {
            status_code: 20000,
            result: [
              {
                items: [
                  {
                    type: 'google_trends_graph',
                    data: [
                      { date_from: '2026-05-17', values: 42 },
                      { date_from: '2026-05-18', values: 55 },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    }));

    const port = createDataforseoTrendsAdapter();
    const end = new Date('2026-05-18T12:00:00Z');
    const start = new Date('2026-05-11T12:00:00Z');
    const out = await port.interestOverTime({
      keywords: ['אזעקות'],
      geo: 'IL',
      startTime: start,
      endTime: end,
    });

    assert.equal(out.keywords[0], 'אזעקות');
    assert.equal(out.series.length, 2);
    assert.equal(out.series[1].values['אזעקות'], 55);
  });

  it('surfaces task error on HTTP 402 (not top-level Ok.)', async () => {
    process.env.DATAFORSEO_LOGIN = 'user';
    process.env.DATAFORSEO_PASSWORD = 'pass';

    mock.method(globalThis, 'fetch', async () => ({
      ok: false,
      status: 402,
      json: async () => ({
        status_code: 20000,
        status_message: 'Ok.',
        tasks: [{ status_code: 40200, status_message: 'Payment Required.' }],
      }),
    }));

    const port = createDataforseoTrendsAdapter();
    const end = new Date('2026-05-18T12:00:00Z');
    const start = new Date('2026-05-11T12:00:00Z');
    await assert.rejects(
      () =>
        port.interestOverTime({
          keywords: ['אזעקות'],
          geo: 'IL',
          startTime: start,
          endTime: end,
        }),
      /Payment Required/,
    );
  });
});
