export function getDocsBaseUrl() {
  const raw = import.meta?.env?.VITE_DOCS_BASE_URL;
  if (typeof raw !== 'string') return 'https://docs.vibeswitch.ai';
  const trimmed = raw.trim().replace(/\/+$/, '');
  return trimmed || 'https://docs.vibeswitch.ai';
}

export function getSupportEmail() {
  const raw = import.meta?.env?.VITE_SUPPORT_EMAIL;
  if (typeof raw !== 'string') return '';
  return raw.trim();
}
