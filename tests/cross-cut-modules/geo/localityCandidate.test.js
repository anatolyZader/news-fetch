import assert from 'node:assert/strict';
import test from 'node:test';

import {
  containsReferenceNameAsToken,
  extractLocalityFromArticleSource,
  inferLocalityCandidateForSignal,
  isDiscourseOnlyMention,
  matchLongestReferenceNameInText,
  parseFieldReportTitleLocality,
} from '../../../cross-cut-modules/geo/localityCandidate.js';
import { normalizeLocalityLookupKey } from '../../../business_modules/geo/domain/services/resolveLocalityMatch.js';
import { GEO_PROVENANCE } from '../../../business_modules/geo/domain/value_objects/geoProvenance.js';

test('extractLocalityFromArticleSource parses pbo and naftali prefixes', () => {
  assert.equal(extractLocalityFromArticleSource('pbo-כרמיאל'), 'כרמיאל');
  assert.equal(extractLocalityFromArticleSource('naftali-Metula'), 'Metula');
});

test('parseFieldReportTitleLocality takes municipality before em dash', () => {
  assert.equal(
    parseFieldReportTitleLocality('מטה אשר/איילון — ברעם (ביקור שטח)'),
    'מטה אשר',
  );
});

test('parseFieldReportTitleLocality returns null for plain news headlines without em dash', () => {
  assert.equal(
    parseFieldReportTitleLocality('הלך לעולמו יששכר דב שפיגל שטבע בים בנתניה'),
    null,
  );
});

test('inferLocalityCandidateForSignal prefers structured municipality over evidence text', () => {
  const { candidate, provenance } = inferLocalityCandidateForSignal({
    source_type: 'pbo',
    municipality: 'כרמיאל',
    evidence: 'Tel Aviv residents reported calm.',
  });
  assert.equal(candidate, 'כרמיאל');
  assert.equal(provenance, GEO_PROVENANCE.structured);
});

test('inferLocalityCandidateForSignal uses article_source when municipality missing', () => {
  const { candidate, provenance } = inferLocalityCandidateForSignal({
    source_type: 'naftali',
    article_source: 'naftali-Metula',
    evidence: 'Weekly update.',
  });
  assert.equal(candidate, 'Metula');
  assert.equal(provenance, GEO_PROVENANCE.structured);
});

test('containsReferenceNameAsToken rejects substring false positive', () => {
  const hay = normalizeLocalityLookupKey('metropolitan area update');
  assert.equal(containsReferenceNameAsToken(hay, normalizeLocalityLookupKey('metula')), false);
});

test('isDiscourseOnlyMention skips analytic framing without locative context', () => {
  const evidence = 'Analysts in Tel Aviv discussed Kiryat Shmona shelters';
  assert.equal(isDiscourseOnlyMention(evidence, 'Kiryat Shmona'), true);
});

test('matchLongestReferenceNameInText requires locative context for news', () => {
  const nameIndex = {
    entries: [
      { normalized: normalizeLocalityLookupKey('kiryat shmona'), display: 'Kiryat Shmona' },
    ],
  };
  const discourse = matchLongestReferenceNameInText(
    'Analysts in Tel Aviv discussed Kiryat Shmona shelters',
    nameIndex,
    { requireLocativeContext: true },
  );
  assert.equal(discourse, null);

  const locative = matchLongestReferenceNameInText(
    'Residents in Kiryat Shmona entered shelters',
    nameIndex,
    { requireLocativeContext: true },
  );
  assert.equal(locative, 'Kiryat Shmona');
});

test('inferLocalityCandidateForSignal returns null for discourse-only news mention', () => {
  const nameIndex = {
    entries: [
      { normalized: normalizeLocalityLookupKey('kiryat shmona'), display: 'Kiryat Shmona' },
    ],
  };
  const { candidate } = inferLocalityCandidateForSignal(
    {
      source_type: 'news',
      evidence: 'Analysts in Tel Aviv discussed Kiryat Shmona shelters',
    },
    { nameIndex },
  );
  assert.equal(candidate, null);
});
