import { SOURCE_TYPE_SOCIAL } from '../value_objects/socialPlatform.js';

const COMPONENT_DEFAULT_SIGNAL = Object.freeze({
  lifesaving_behavior: 'compliance_enter_shelter',
  information_communication: 'mistrusted_information_source',
  community_capital: 'community_volunteering',
  narrative: 'fear_expression',
  belonging_solidarity: 'solidarity_help_others',
  leadership: 'institutional_abandonment_perception',
  functional_continuity: 'service_disruption',
  wellbeing_at_risk: 'psychological_distress',
});

const CONFIDENCE_WEIGHT = Object.freeze({
  high: 0.9,
  medium: 0.65,
  low: 0.4,
  'גבוהה': 0.9,
  'בינונית': 0.65,
  'נמוכה': 0.4,
});

/**
 * @param {string} raw
 * @returns {'high'|'medium'|'low'}
 */
export function normalizeConfidence(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'high' || s === 'גבוהה') return 'high';
  if (s === 'low' || s === 'נמוכה') return 'low';
  return 'medium';
}

/**
 * @param {string} componentId
 * @returns {string}
 */
export function defaultSignalTypeForComponent(componentId) {
  return COMPONENT_DEFAULT_SIGNAL[componentId] ?? 'fear_expression';
}

/**
 * @param {object} finding OSINT finding from citizen-voice bundle
 * @returns {object|null} resilience pipeline signal or null when unusable
 */
export function mapFindingToSignal(finding) {
  const quote = String(finding?.quote_original ?? '').trim();
  if (!quote) return null;

  const component = String(finding?.resilience_component ?? '').trim();
  const confidence = normalizeConfidence(finding?.confidence);
  const weight = CONFIDENCE_WEIGHT[confidence] ?? CONFIDENCE_WEIGHT.medium;

  const location = String(finding?.location ?? '').trim();
  const behavior = String(finding?.behavior_or_emotion ?? '').trim();
  const evidenceParts = [quote];
  if (location) evidenceParts.push(`(${location})`);
  if (behavior) evidenceParts.push(`— ${behavior}`);

  return {
    signal_type: defaultSignalTypeForComponent(component),
    evidence_type: confidence === 'high' ? 'direct_quote_named_person' : 'observational_reported_fact',
    evidence: evidenceParts.join(' '),
    scope_level: confidence === 'high' ? 'repeated_pattern' : 'single_case',
    article_url: String(finding?.url ?? ''),
    article_source: String(finding?.platform ?? SOURCE_TYPE_SOCIAL),
    speaker_role: String(finding?.speaker_role ?? ''),
    osint_finding_id: String(finding?.id ?? ''),
    extraction_confidence: weight,
    source_type: SOURCE_TYPE_SOCIAL,
  };
}

/**
 * @param {object[]} findings
 * @returns {object[]}
 */
export function mapFindingsToSignals(findings) {
  if (!Array.isArray(findings)) return [];
  return findings.map(mapFindingToSignal).filter(Boolean);
}
