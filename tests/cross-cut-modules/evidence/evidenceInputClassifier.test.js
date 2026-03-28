import { describe, it } from 'node:test';
import assert from 'node:assert';
import { classifyEvidenceInput } from '../../../cross-cut-modules/evidence/evidenceInputClassifier.js';

describe('classifyEvidenceInput', () => {
  it('classifies URL-only input as important evidence URL', () => {
    const result = classifyEvidenceInput(' https://example.com/story ');
    assert.strictEqual(result.category, 'url_to_important_evidence');
    assert.strictEqual(result.detectedUrl, 'https://example.com/story');
  });

  it('classifies mixed text + URL as single evidence piece', () => {
    const result = classifyEvidenceInput('This claim matters: https://example.com/story');
    assert.strictEqual(result.category, 'single_evidence_piece');
    assert.strictEqual(result.detectedUrl, null);
  });

  it('classifies plain text as single evidence piece', () => {
    const result = classifyEvidenceInput('Observed people rushing into shelter in under 20 seconds.');
    assert.strictEqual(result.category, 'single_evidence_piece');
    assert.strictEqual(result.detectedUrl, null);
  });
});
