/**
 * Map classified social OSINT findings to open-extract units.
 */
import { normalizeExtractUnits } from '../../../open_observation_extraction/index.js';

/**
 * @param {Array<object>} findings
 * @returns {Array<object>}
 */
export function socialFindingsToExtractUnits(findings = []) {
  const units = [];
  for (const [i, f] of (findings ?? []).entries()) {
    const quote = String(f.quote_original ?? f.text ?? '').trim();
    if (!quote) continue;
    const meta = [
      f.platform ? `platform=${f.platform}` : null,
      f.resilience_component ? `component=${f.resilience_component}` : null,
      f.location ? `location=${f.location}` : null,
      f.behavior_or_emotion ? `behavior=${f.behavior_or_emotion}` : null,
    ].filter(Boolean).join(' ');
    const body = meta ? `${quote}\n[${meta}]` : quote;
    units.push({
      title: f.behavior_or_emotion ?? f.id ?? `social-${i + 1}`,
      url: f.url ?? null,
      source: f.platform ? `social:${f.platform}` : 'social',
      body,
      article_index: i + 1,
    });
  }
  return normalizeExtractUnits(units);
}
