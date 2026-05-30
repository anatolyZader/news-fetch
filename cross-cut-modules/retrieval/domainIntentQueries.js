/**
 * Domain intent queries for resilience A/B/C extraction passes (shared by pipeline RAG).
 */
export const DOMAIN_INTENT_QUERIES = Object.freeze({
  A: 'civilian protective behavior: shelter use, compliance with instructions, evacuation, injuries, risk, alerts',
  B: 'institutional response: guidance and communication, service continuity/disruption (schools, hospitals, transport), leadership actions',
  C: 'social fabric & wellbeing: volunteering, mutual aid, solidarity, morale/narratives, resources/shortages, mental health, vulnerable groups',
});

export function domainIntentQuery(domainGroupKey) {
  return DOMAIN_INTENT_QUERIES[domainGroupKey] ?? DOMAIN_INTENT_QUERIES.B;
}
