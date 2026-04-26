export function scoreVariant10(score) {
  if (score <= 2) return 'critical';
  if (score <= 4) return 'weak';
  if (score <= 6) return 'moderate';
  if (score <= 8) return 'good';
  return 'strong';
}

export function scoreVariant01(score) {
  if (score == null) return 'neutral';
  if (score >= 0.8) return 'good';
  if (score >= 0.6) return 'moderate';
  if (score >= 0.4) return 'weak';
  if (score >= 0.2) return 'alert';
  return 'critical';
}

export function scoreLabel10(score, labels) {
  if (score <= 2) return labels.critical;
  if (score <= 4) return labels.weak;
  if (score <= 6) return labels.moderate;
  if (score <= 8) return labels.good;
  return labels.strong;
}

function resolveTone(theme, key) {
  const palette = theme?.palette?.score ?? {};
  return palette[key] ?? palette.neutral ?? { main: '#6b7280', soft: '#f5f6fa' };
}

export function scoreColor10(score, theme) {
  return resolveTone(theme, scoreVariant10(score)).main;
}

export function scoreColor01(score, theme) {
  if (score == null) return resolveTone(theme, 'neutral').main;
  return resolveTone(theme, scoreVariant01(score)).main;
}

export function scoreBg01(score, theme) {
  if (score == null) return 'transparent';
  return resolveTone(theme, scoreVariant01(score)).soft;
}
