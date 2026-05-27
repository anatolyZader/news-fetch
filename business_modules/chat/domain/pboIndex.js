/**
 * Build PBO municipality index and lookup map from raw signals.
 */
export function buildPboIndex(signals) {
  if (!signals || signals.length === 0) return { index: '', lookup: {} };
  const pbo = signals.filter((s) => s.source_type === 'pbo');
  if (pbo.length === 0) return { index: '', lookup: {} };

  const byMuni = {};
  for (const s of pbo) {
    const name = s.article_source?.replace(/^pbo-/, '') ?? 'unknown';
    if (!byMuni[name]) byMuni[name] = [];
    byMuni[name].push(s);
  }

  // Build compact index: one line per municipality with overall avg
  const indexLines = [];
  const lookup = {};

  for (const [muni, sigs] of Object.entries(byMuni)) {
    const parts = [];
    for (const s of sigs) {
      const m = s.evidence?.match(/\] (.+?): avg=(\d+)%(.*)/);
      if (m) {
        const freeText = m[3]?.replace(/^[^—]*— ?/, '').trim();
        parts.push(`${m[1]}: ${m[2]}%${freeText ? ' — ' + freeText : ''}`);
      } else {
        parts.push(s.evidence);
      }
    }
    // Store full detail for tool lookup
    lookup[muni] = parts.join('\n');

    // Extract per-signal avg percentages for overall computation
    const pctMatches = sigs
      .map((s) => s.evidence?.match(/avg=(\d+)%/))
      .filter(Boolean)
      .map((m) => Number.parseInt(m[1], 10));
    const overallAvg = pctMatches.length > 0
      ? Math.round(pctMatches.reduce((a, b) => a + b, 0) / pctMatches.length)
      : null;

    indexLines.push(`${muni}: ${overallAvg == null ? 'N/A' : overallAvg + '%'}`);
  }

  // Sort by avg ascending so outliers are visible at top/bottom
  indexLines.sort((a, b) => a.localeCompare(b));

  const index =
    `\n\nPBO MUNICIPALITY INDEX (${Object.keys(byMuni).length} municipalities, overall avg score):\n` +
    indexLines.join('\n') +
    `\n\nUse the lookup_pbo tool to get detailed per-component data for a specific municipality.`;

  return { index, lookup };
}
