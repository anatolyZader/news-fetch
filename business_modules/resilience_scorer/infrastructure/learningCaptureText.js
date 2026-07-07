/**
 * Text helpers for learning capture (zero-signal snippets).
 */

const RELEVANCE_KEYWORDS = [
  'מקלט', 'פינוי', 'אזעקה', 'מתנדב', 'חרדה', 'שירות', 'קהילה', 'ילדים',
  'shelter', 'evacuat', 'volunteer', 'anxiety', 'community', 'siren', 'alert',
];

/**
 * @param {string} body
 * @param {number} k
 */
export function extractTopKParagraphsForLearning(body, k = 2) {
  const text = String(body ?? '').trim();
  if (!text) return '';
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= k) return paragraphs.join('\n\n').slice(0, 600);

  const scored = paragraphs.map((p, i) => {
    const lower = p.toLowerCase();
    let hits = 0;
    for (const kw of RELEVANCE_KEYWORDS) {
      if (lower.includes(kw.toLowerCase())) hits += 1;
    }
    return { i, hits, len: p.length };
  });
  scored.sort((a, b) => b.hits - a.hits || b.len - a.len);
  const chosen = scored.slice(0, k).sort((a, b) => a.i - b.i);
  return chosen.map(({ i }) => paragraphs[i]).join('\n\n').slice(0, 600);
}
