const NEWS_DOMAIN_RE = /\b(ynet|maariv|walla|mako|n12|kan\.org|israelhayom|timesofisrael|jpost|haaretz)\b/i;
const OFFICIAL_SPEAKER_RE = /\b(עיתונא|כתב|דובר|רשות|משרד|עירייה|פיקוד|צה"ל|idf|news|official)\b/i;

const REJECTION_REASONS = Object.freeze({
  news_domain: 'news_domain',
  no_citizen_quote: 'no_citizen_quote',
  official_speaker: 'official_speaker',
  not_public_or_login_required: 'not_public_or_login_required',
  off_topic: 'off_topic',
});

/**
 * @param {{ url?: string, quote_original?: string, speaker_role?: string, platform?: string }} candidate
 * @returns {{ accepted: boolean, reason?: string }}
 */
export function evaluateCitizenVoiceCandidate(candidate) {
  const url = String(candidate?.url ?? '');
  const quote = String(candidate?.quote_original ?? '').trim();
  const speakerRole = String(candidate?.speaker_role ?? '');
  const platform = String(candidate?.platform ?? '');

  if (url && NEWS_DOMAIN_RE.test(url)) {
    return { accepted: false, reason: REJECTION_REASONS.news_domain };
  }

  if (!quote || quote.length < 12) {
    return { accepted: false, reason: REJECTION_REASONS.no_citizen_quote };
  }

  if (OFFICIAL_SPEAKER_RE.test(speakerRole)) {
    return { accepted: false, reason: REJECTION_REASONS.official_speaker };
  }

  if (/news|n12|kan|maariv|ynet/i.test(platform)) {
    return { accepted: false, reason: REJECTION_REASONS.official_speaker };
  }

  return { accepted: true };
}

export { REJECTION_REASONS };
