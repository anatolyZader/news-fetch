const LOCALE_TAG = { en: 'en', he: 'he-IL', ru: 'ru-RU' };

/**
 * @param {string} [lang]
 */
function resolveIntlLocale(lang) {
  if (!lang || lang === 'en') return 'en';
  return LOCALE_TAG[lang] ?? 'en';
}

/**
 * @param {unknown} input
 * @param {string} [lang]
 * @returns {string}
 */
export function formatDate(input, lang) {
  if (input == null || input === '') return '—';

  let date;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const [y, m, d] = input.slice(0, 10).split('-').map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = input instanceof Date ? input : new Date(input);
  }

  if (Number.isNaN(date.getTime())) return '—';

  if (!lang || lang === 'en') {
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    return `${dd}.${mm}.${yyyy}`;
  }

  return new Intl.DateTimeFormat(resolveIntlLocale(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** 24-hour clock HH:mm (local timezone). */
export function formatTime24(input) {
  if (input == null || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Published stamp for ingest cards: localized date + optional HH:mm. */
export function formatPublishedDateTime(input, lang) {
  if (input == null || input === '') return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const hasTime = /T\d{2}:\d{2}/.test(raw) || /\d{1,2}:\d{2}/.test(raw);
  const datePart = formatDate(raw, lang);
  if (datePart === '—') return null;
  if (!hasTime) return datePart;

  const timePart = formatTime24(raw);
  return timePart ? `${datePart} ${timePart}` : datePart;
}
