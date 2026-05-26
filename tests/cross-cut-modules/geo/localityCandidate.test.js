import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLocalityFromArticleSource,
  inferLocalityCandidateForSignal,
  parseFieldReportTitleLocality,
} from '../../../cross-cut-modules/geo/localityCandidate.js';

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

test('inferLocalityCandidateForSignal prefers structured municipality over evidence text', () => {
  const { candidate } = inferLocalityCandidateForSignal({
    source_type: 'pbo',
    municipality: 'כרמיאל',
    evidence: 'Tel Aviv residents reported calm.',
  });
  assert.equal(candidate, 'כרמיאל');
});

test('inferLocalityCandidateForSignal uses article_source when municipality missing', () => {
  const { candidate } = inferLocalityCandidateForSignal({
    source_type: 'naftali',
    article_source: 'naftali-Metula',
    evidence: 'Weekly update.',
  });
  assert.equal(candidate, 'Metula');
});
