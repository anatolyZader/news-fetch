export function formatDate(input) {
  if (input == null || input === '') return '—';
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}/.test(input)) {
    const [y, m, d] = input.slice(0, 10).split('-');
    return `${d}.${m}.${y}`;
  }
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  return `${dd}.${mm}.${yyyy}`;
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

/** Published stamp for ingest cards: `dd.mm.yyyy HH:mm` (date-only inputs omit time). */
export function formatPublishedDateTime(input) {
  if (input == null || input === '') return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const hasTime = /T\d{2}:\d{2}/.test(raw) || /\d{1,2}:\d{2}/.test(raw);
  const datePart = formatDate(raw);
  if (datePart === '—') return null;
  if (!hasTime) return datePart;

  const timePart = formatTime24(raw);
  return timePart ? `${datePart} ${timePart}` : datePart;
}
