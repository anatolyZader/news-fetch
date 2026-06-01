/**
 * Profile-specific prompts for open-vocabulary extraction.
 */

const BASE_SYSTEM =
  'You extract atomic behavioral observations about Israeli civilian populations under emergency conditions.\n' +
  'Rules:\n' +
  '- One observation = one behavioral fact (split compound sentences).\n' +
  '- Ground every observation in verbatim or near-verbatim evidence from the text.\n' +
  '- Do NOT assign snake_case signal_type from a fixed taxonomy.\n' +
  '- Do NOT score resilience components.\n' +
  '- Output ONLY a JSON array.\n\n' +
  'Each object:\n' +
  '{"article_index":N,"behavioral_description":"short label","evidence":"quote or reported fact",' +
  '"polarity":"positive|negative|mixed|unknown","confidence":"low|medium|high",' +
  '"entities":[],"suggested_catalog_types":[],"tags":[]}\n' +
  'suggested_catalog_types: optional guesses if an existing taxonomy type might fit (0–3 snake_case types); leave [] if unsure.\n' +
  'Return [] when no behavioral facts are present.';

const PROFILE_SUFFIX = Object.freeze({
  exploratory:
    '\n\nProfile: EXPLORATORY — cast a wide net for any civilian behavioral, institutional, or community pattern worth catalog research.',
  document_pack:
    '\n\nProfile: DOCUMENT_PACK — one-off document batch; prefer concrete local facts over national macro unless text ties them to civilian behavior.',
  residual:
    '\n\nProfile: RESIDUAL — these articles yielded zero signals in closed-vocabulary extraction. ' +
    'Find facts the taxonomy may be missing. Include nearest_existing_types (1–3 snake_case types if partial fit) ' +
    'and novelty_hint: low|medium|high. Do NOT invent signal_type fields.',
});

/**
 * @param {Array<object>} articles
 * @param {string} profile
 */
export function buildOpenExtractionPrompt(articles, profile = 'exploratory') {
  const suffix = PROFILE_SUFFIX[profile] ?? PROFILE_SUFFIX.exploratory;
  const system = BASE_SYSTEM + suffix;

  const blocks = articles.map((art, i) => {
    const idx = i + 1;
    const body = String(art.promptBody ?? art.body ?? '').trim().slice(0, 4000);
    const meta = [
      art.url ? `url=${art.url}` : null,
      art.source ? `source=${art.source}` : null,
      art.title ? `title=${String(art.title).slice(0, 120)}` : null,
    ].filter(Boolean).join(' ');
    return `[Article ${idx}] ${meta}\n${body || '(no body)'}`;
  }).join('\n\n---\n\n');

  const user =
    `Extract behavioral observations from ${articles.length} article(s):\n\n${blocks}\n\n` +
    'Return only the JSON array.';

  return { system, user };
}

/**
 * Residual profile uses same shape as legacy residual capture for catalog learning.
 * @param {Array<object>} articles
 */
export function buildResidualExtractionPrompt(articles) {
  return buildOpenExtractionPrompt(articles, 'residual');
}
