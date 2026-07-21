import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  groupEvidenceBySourceType,
  inferSourceTypeFromArticleSource,
  normalizeEvidenceSourceType,
  parseEvidenceCitation,
  resolveEvidenceSourceMeta,
  stripTrailingEvidenceCitation,
} from '../../../client/src/lib/evidenceSourceMeta.js';

describe('evidenceSourceMeta', () => {
  it('normalizeEvidenceSourceType maps news and field variants', () => {
    assert.equal(normalizeEvidenceSourceType('news'), 'press');
    assert.equal(normalizeEvidenceSourceType('field_report'), 'visits');
    assert.equal(normalizeEvidenceSourceType('pbo'), 'pbo');
  });

  it('inferSourceTypeFromArticleSource detects pbo and press labels', () => {
    assert.equal(inferSourceTypeFromArticleSource('pbo-north'), 'pbo');
    assert.equal(inferSourceTypeFromArticleSource('ynet.co.il'), 'press');
    assert.equal(inferSourceTypeFromArticleSource('ICE local'), 'press');
  });

  it('parseEvidenceCitation reads readable parenthetical citations', () => {
    assert.deepEqual(
      parseEvidenceCitation('Schools reopened late (Maariv, 12 Apr 2026)'),
      { label: 'Maariv', url: null },
    );
  });

  it('stripTrailingEvidenceCitation removes trailing citation', () => {
    assert.equal(
      stripTrailingEvidenceCitation('Schools reopened late (Maariv, 12 Apr 2026)'),
      'Schools reopened late',
    );
  });

  it('resolveEvidenceSourceMeta infers press badge metadata from inline citation', () => {
    const meta = resolveEvidenceSourceMeta(
      '- Clinics operating normally (Maariv, 12 Apr 2026)',
      [],
    );
    assert.equal(meta.source_type, 'press');
    assert.equal(meta.article_source, 'Maariv');
  });

  it('resolveEvidenceSourceMeta prefers structured fields on evidence objects', () => {
    const meta = resolveEvidenceSourceMeta({
      text: 'Settlement excerpt',
      source_type: 'pbo',
      article_source: 'pbo-abelin',
    }, []);
    assert.equal(meta.source_type, 'pbo');
    assert.equal(meta.article_source, 'pbo-abelin');
  });

  it('resolveEvidenceSourceMeta matches component signals by label', () => {
    const meta = resolveEvidenceSourceMeta(
      'Residents report fear (ynet.co.il, 12 Apr 2026)',
      [{
        source_type: 'news',
        article_source: 'ynet.co.il',
        article_url: 'https://www.ynet.co.il/news/article-1',
      }],
    );
    assert.equal(meta.source_type, 'press');
    assert.equal(meta.article_source, 'ynet.co.il');
    assert.equal(meta.url, 'https://www.ynet.co.il/news/article-1');
  });

  it('groupEvidenceBySourceType buckets press and pbo separately', () => {
    const groups = groupEvidenceBySourceType([
      { source_type: 'news', evidence: 'Press item' },
      { source_type: 'pbo', evidence: 'PBO item' },
    ], []);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].key, 'pbo');
    assert.equal(groups[1].key, 'press');
  });
});
