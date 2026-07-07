import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildArticlesFromInput } from '../../../../business_modules/resilience_scorer/app/traceArticleCli.js';

const MD = `# Manual articles (2026-06-15)

## 1. Mayor reopens schools
- **URL:** https://example.com/a
- **Published:** 2026-06-15
- **Source:** Ynet

The mayor said schools reopen Sunday. Residents reported anxiety.

---

## 2. Shelter upgrades
- **URL:** https://example.com/b
- **Published:** 2026-06-15
- **Source:** Haaretz

The council added safe rooms in three neighborhoods.
`;

describe('buildArticlesFromInput', () => {
  it('treats raw text as one article and derives the title from the first line', () => {
    const out = buildArticlesFromInput({ content: 'Mayor said schools reopen\nResidents anxious.', date: '2026-06-15' });
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'Mayor said schools reopen');
    assert.equal(out[0].source, 'manual');
    assert.equal(out[0].publishedAt, '2026-06-15');
    assert.match(out[0].body, /Residents anxious/);
    assert.equal(out[0].temporal_weight, 1);
  });

  it('parses numbered-md content and takes the first article by default', () => {
    const out = buildArticlesFromInput({ content: MD });
    assert.equal(out.length, 1);
    assert.equal(out[0].title, 'Mayor reopens schools');
    assert.equal(out[0].url, 'https://example.com/a');
    assert.equal(out[0].source, 'Ynet');
    assert.match(out[0].body, /reopen Sunday/);
  });

  it('returns all sections when --all is set', () => {
    const out = buildArticlesFromInput({ content: MD, all: true });
    assert.equal(out.length, 2);
    assert.equal(out[1].title, 'Shelter upgrades');
    assert.equal(out[1].source, 'Haaretz');
  });

  it('applies explicit title/source/url overrides', () => {
    const out = buildArticlesFromInput({
      content: 'some body text',
      title: 'Custom Title',
      source: 'FieldDesk',
      url: 'https://x/y',
      date: '2026-06-15',
    });
    assert.equal(out[0].title, 'Custom Title');
    assert.equal(out[0].source, 'FieldDesk');
    assert.equal(out[0].url, 'https://x/y');
  });

  it('caps body length', () => {
    const long = 'a'.repeat(5000);
    const out = buildArticlesFromInput({ content: long });
    assert.equal(out[0].body.length, 2000);
  });
});
