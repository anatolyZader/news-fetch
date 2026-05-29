/**
 * Build PBO municipality index and lookup map from raw signals.
 */

function groupPboByMuni(pbo) {
  const byMuni = {};
  for (const s of pbo) {
    const name = s.article_source?.replace(/^pbo-/, '') ?? 'unknown';
    if (!byMuni[name]) byMuni[name] = [];
    byMuni[name].push(s);
  }
  return byMuni;
}

function formatPboSignalPart(signal) {
  const m = signal.evidence?.match(/\] (.+?): avg=(\d+)%(.*)/);
  if (!m) return signal.evidence;
  const freeText = m[3]?.replace(/^[^—]*— ?/, '').trim();
  const suffix = freeText ? ' — ' + freeText : '';
  return `${m[1]}: ${m[2]}%${suffix}`;
}

function overallAvgForSignals(sigs) {
  const pctMatches = sigs
    .map((s) => s.evidence?.match(/avg=(\d+)%/))
    .filter(Boolean)
    .map((m) => Number.parseInt(m[1], 10));
  if (!pctMatches.length) return null;
  return Math.round(pctMatches.reduce((a, b) => a + b, 0) / pctMatches.length);
}

function buildMuniIndexLine(muni, sigs) {
  const overallAvg = overallAvgForSignals(sigs);
  if (overallAvg == null) return `${muni}: N/A`;
  return `${muni}: ${overallAvg}%`;
}

export function buildPboIndex(signals) {
  if (!signals || signals.length === 0) return { index: '', lookup: {} };
  const pbo = signals.filter((s) => s.source_type === 'pbo');
  if (pbo.length === 0) return { index: '', lookup: {} };

  const byMuni = groupPboByMuni(pbo);
  const indexLines = [];
  const lookup = {};

  for (const [muni, sigs] of Object.entries(byMuni)) {
    lookup[muni] = sigs.map(formatPboSignalPart).join('\n');
    indexLines.push(buildMuniIndexLine(muni, sigs));
  }

  indexLines.sort((a, b) => a.localeCompare(b));

  const index =
    `\n\nPBO MUNICIPALITY INDEX (${Object.keys(byMuni).length} municipalities, overall avg score):\n` +
    indexLines.join('\n') +
    `\n\nUse the lookup_pbo tool to get detailed per-component data for a specific municipality.`;

  return { index, lookup };
}
