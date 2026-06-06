import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createVisitsFsAdapter } from '../../../../../business_modules/visits/infrastructure/adapters/visitsFsAdapter.js';

test('visits fs adapter parses raw field reports and attaches signals', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'visits-'));
  const reportsDir = join(rootDir, 'reports');
  const signalsDir = join(rootDir, 'signals');
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(signalsDir, { recursive: true });

  try {
    writeFileSync(join(reportsDir, 'articles-field-reports-2026-03-24.md'), [
      '# Field-reports articles (2026-03-24)',
      '',
      '## 1. מטה אשר/איילון — ברעם (ביקור שטח)',
      '',
      '- **Published:** 2026-03-15T12:00:00Z',
      '- **Source:** squad one',
      '',
      'גורמים שנפגשו: manager',
      '',
      'First finding, second finding. Third finding.',
      '',
      '---',
      '',
    ].join('\n'));
    writeFileSync(join(signalsDir, 'signals-field-2026-03-24.json'), JSON.stringify({
      source_type: 'field',
      date: '2026-03-24',
      total_articles: 1,
      signals: [
        { article_index: 1, signal_type: 'resource_shortage', evidence: 'missing shelter' },
        { article_index: 1, signal_type: 'community_volunteering', evidence: 'active volunteers' },
      ],
    }));

    const days = createVisitsFsAdapter({ rootDir, reportsDir, signalsDir }).listVisitDays();

    assert.equal(days.length, 1);
    assert.equal(days[0].visitCount, 1);
    assert.equal(days[0].signalCount, 2);
    assert.deepEqual(days[0].municipalities, ['מטה אשר/איילון']);
    assert.equal(days[0].visits[0].title, 'מטה אשר/איילון — ברעם');
    assert.equal(days[0].visits[0].stakeholders, 'manager');
    assert.deepEqual(days[0].visits[0].notePoints, [
      'First finding',
      'second finding',
      'Third finding',
    ]);
    assert.equal(days[0].visits[0].signalCount, 2);
    assert.deepEqual(days[0].visits[0].signalTypes, [
      { type: 'community_volunteering', count: 1 },
      { type: 'resource_shortage', count: 1 },
    ]);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('visits fs adapter loads field signals from signals_extraction data when missing from module dir', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'visits-'));
  const reportsDir = join(rootDir, 'reports');
  const moduleSignalsDir = join(rootDir, 'business_modules', 'visits', 'data', 'signals');
  const legacySignalsDir = join(rootDir, 'business_modules', 'signals_extraction', 'data', 'signals');
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(legacySignalsDir, { recursive: true });

  try {
    writeFileSync(join(reportsDir, 'articles-field-reports-2026-03-24.md'), [
      '# Field-reports articles (2026-03-24)',
      '',
      '## 1. מטה אשר/איילון — ברעם (ביקור שטח)',
      '',
      '- **Published:** 2026-03-15T12:00:00Z',
      '- **Source:** squad one',
      '',
      'גורמים שנפגשו: manager',
      '',
      'Note body.',
      '',
      '---',
      '',
    ].join('\n'));
    writeFileSync(join(legacySignalsDir, 'signals-field-2026-03-24.json'), JSON.stringify({
      source_type: 'field',
      date: '2026-03-24',
      total_articles: 1,
      signals: [
        { article_index: 1, signal_type: 'resource_shortage', evidence: 'x' },
      ],
    }));

    const days = createVisitsFsAdapter({
      rootDir,
      reportsDir,
      signalsDir: moduleSignalsDir,
    }).listVisitDays();

    assert.equal(days.length, 1);
    assert.equal(days[0].visits[0].signalCount, 1);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('visits fs adapter ignores 1970 placeholder visit exports', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'visits-'));
  const reportsDir = join(rootDir, 'reports');
  const signalsDir = join(rootDir, 'signals');
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(signalsDir, { recursive: true });

  try {
    writeFileSync(join(reportsDir, 'articles-field-reports-1970-01-01.md'), [
      '# Field-reports articles (1970-01-01)',
      '',
      '## 1. Placeholder (ביקור שטח)',
      '',
      '- **Published:** 1970-01-01T12:00:00Z',
      '- **Source:** squad one',
      '',
      'Duplicate export with bad spreadsheet date.',
      '',
      '---',
      '',
    ].join('\n'));
    writeFileSync(join(signalsDir, 'signals-field-1970-01-01.json'), JSON.stringify({
      source_type: 'field',
      date: '1970-01-01',
      signals: [{ article_index: 1, signal_type: 'resource_shortage' }],
    }));

    const days = createVisitsFsAdapter({ rootDir, reportsDir, signalsDir }).listVisitDays();

    assert.deepEqual(days, []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test('visits fs adapter ignores dates with no parsed visits', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'visits-'));
  const reportsDir = join(rootDir, 'reports');
  const signalsDir = join(rootDir, 'signals');
  mkdirSync(reportsDir, { recursive: true });
  mkdirSync(signalsDir, { recursive: true });

  try {
    writeFileSync(join(reportsDir, 'articles-field-reports-2026-03-29.md'), [
      '# Field-reports articles (2026-03-29)',
      '',
      'Professional squad visits to municipalities.',
      '',
    ].join('\n'));
    writeFileSync(join(signalsDir, 'signals-field-2026-03-29.json'), JSON.stringify({
      source_type: 'field',
      date: '2026-03-29',
      total_articles: 0,
      signals: [{ article_index: 1, signal_type: 'resource_shortage' }],
    }));

    const days = createVisitsFsAdapter({ rootDir, reportsDir, signalsDir }).listVisitDays();

    assert.deepEqual(days, []);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
