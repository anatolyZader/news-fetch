import { describe, it } from 'node:test';
import assert from 'node:assert';

import { buildDigestParts } from '../../../../business_modules/mailing/app/digestAssembler.js';
import { LABELS } from '../../../../business_modules/mailing/domain/copy/mailingLabels.js';

const REPORT_ONLY = { report: true, naftali: false, education: false, platform: false };

const emptyPools = {
  getNaftaliDashboard: async () => ({}),
  getEducationDashboard: async () => ({}),
};

function assemble({ reportDate = '2026-04-03', today = '2026-08-08', language = 'en', translateReport, assessment } = {}) {
  return buildDigestParts(
    {
      getCachedReport: () => ({
        reportDate,
        assessment: assessment ?? { components: [], cross_component_synthesis: 'synthesis' },
      }),
      translateReport,
      poolService: emptyPools,
      today,
    },
    REPORT_ONLY,
    language,
  );
}

describe('digest staleness banner', () => {
  it('warns when the report is not today’s', async () => {
    const { text, html } = await assemble();

    assert.match(text, /Not today’s report/);
    assert.match(text, /2026-04-03/);
    assert.match(text, /2026-08-08/);
    assert.match(html, /Not today’s report/);
  });

  it('renders the banner inside the report card, above Metadata', async () => {
    const { html } = await assemble();

    const mainAt = html.indexOf('<main');
    const bannerAt = html.indexOf('#fffbeb');
    const metadataAt = html.indexOf(LABELS.en.metadata);

    assert.ok(mainAt > -1 && bannerAt > -1 && metadataAt > -1);
    assert.ok(bannerAt > mainAt, 'banner must sit inside <main>, not beside the card');
    assert.ok(bannerAt < metadataAt, 'banner must precede the Metadata section');
  });

  it('stays silent when the report is today’s', async () => {
    const { text, html } = await assemble({ reportDate: '2026-08-08', today: '2026-08-08' });

    assert.doesNotMatch(text, /Not today’s report/);
    assert.ok(!html.includes('#fffbeb'));
  });

  it('is localized, and RTL for Hebrew', async () => {
    const he = await assemble({ language: 'he' });
    assert.match(he.text, /הדוח אינו של היום/);
    assert.match(he.html, /dir="rtl"/);
    // Dates are isolated so they cannot drag punctuation in RTL copy.
    assert.match(he.html, /<bdi>2026-04-03<\/bdi>/);

    const ru = await assemble({ language: 'ru' });
    assert.match(ru.text, /Отчёт не за сегодня/);
  });

  it('survives a translation failure', async () => {
    const { text } = await assemble({
      language: 'he',
      translateReport: async () => {
        throw new Error('translation down');
      },
    });

    assert.match(text, /הדוח אינו של היום/);
  });

  it('falls back to the assessment date when the payload has no reportDate', async () => {
    const { text } = await buildDigestParts(
      {
        getCachedReport: () => ({ assessment: { date: '2026-03-25', components: [] } }),
        poolService: emptyPools,
        today: '2026-08-08',
      },
      REPORT_ONLY,
      'en',
    );

    // Same date the Metadata row shows — the notice must not diverge from it.
    assert.match(text, /Not today’s report/);
    assert.match(text, /dated 2026-03-25/);
    assert.match(text, /Report date: 2026-03-25/);
  });

  it('shows no banner when there is no report at all', async () => {
    const { text, html } = await buildDigestParts(
      { getCachedReport: () => null, poolService: emptyPools, today: '2026-08-08' },
      REPORT_ONLY,
      'en',
    );

    assert.match(text, /No report available/);
    assert.doesNotMatch(text, /Not today’s report/);
    assert.ok(!html.includes('#fffbeb'));
  });

  it('renders nothing for the report product when it is disabled', async () => {
    const { text } = await buildDigestParts(
      { getCachedReport: () => ({ reportDate: '2026-04-03', assessment: { components: [] } }), poolService: emptyPools, today: '2026-08-08' },
      { report: false, naftali: false, education: false, platform: false },
      'en',
    );

    assert.strictEqual(text, '');
  });
});
