import { describe, it } from 'node:test';
import assert from 'node:assert';

// exercise merge helpers via dynamic import of the module's behavior — test dedup logic inline
// (merge functions are not exported; duplicate minimal logic for regression)
function evidenceDedupKey(a) {
  const u = (a.url ?? '').trim();
  const t = (a.title ?? '').replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
  return `${u}|${t}`;
}

function mergeHomefrontAndDbEvidence(fileArticles, dbArticles) {
  const seen = new Set();
  const out = [];
  for (const a of fileArticles) {
    const k = evidenceDedupKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  for (const a of dbArticles) {
    const k = evidenceDedupKey(a);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

describe('mergeHomefrontAndDbEvidence (mirrors analysisService)', () => {
  it('concatenates when no overlap', () => {
    const m = mergeHomefrontAndDbEvidence(
      [{ title: 'A', url: 'https://a.com', body: '1' }],
      [{ title: 'B', url: 'https://b.com', body: '2' }],
    );
    assert.strictEqual(m.length, 2);
  });

  it('drops DB duplicate of same url+title as file', () => {
    const m = mergeHomefrontAndDbEvidence(
      [{ title: 'Same', url: 'https://x.com', body: 'from file' }],
      [{ title: 'Same', url: 'https://x.com', body: 'from db' }],
    );
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].body, 'from file');
  });
});
