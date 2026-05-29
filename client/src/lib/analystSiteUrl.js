export function getAnalystSiteUrl() {
  const raw = import.meta?.env?.VITE_ANALYST_SITE_URL;
  if (typeof raw !== 'string') return 'https://analyst.vibeswitch.ai';
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed || 'https://analyst.vibeswitch.ai';
}
