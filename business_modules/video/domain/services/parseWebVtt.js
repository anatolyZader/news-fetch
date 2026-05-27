/**
 * Parse WebVTT (or loose VTT-like) content into timed text segments.
 * Speaker labels are not present in YouTube captions; all lines use speaker "CAPTION".
 *
 * @param {string} vtt
 * @returns {Array<{ speaker: string, text: string, start: number, end: number }>}
 */
export function parseWebVttToSegments(vtt) {
  const text = String(vtt).replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  /** @type {Array<{ speaker: string, text: string, start: number, end: number }>} */
  const segments = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const arrow = line.includes('-->');
    if (!arrow) {
      i += 1;
      continue;
    }

    const { start, end } = parseVttTimestampLine(line);
    if (start == null || end == null) {
      i += 1;
      continue;
    }

    i += 1;
    const bodyLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      bodyLines.push(lines[i]);
      i += 1;
    }
    const raw = bodyLines.join('\n').trim();
    const cleaned = stripVttInlineTags(raw).replaceAll(/\s+/g, ' ').trim();
    if (cleaned) {
      segments.push({
        speaker: 'CAPTION',
        text: cleaned,
        start,
        end,
      });
    }
    i += 1;
  }

  return segments;
}

/**
 * @param {string} line e.g. "00:01:02.123 --> 00:01:05.456" or "00:02.500 --> 00:05.000"
 */
function parseVttTimestampLine(line) {
  const m = /^\s*([^\s]+)\s*-->\s*([^\s]+)/.exec(line);
  if (!m) return { start: null, end: null };
  return { start: parseVttTime(m[1]), end: parseVttTime(m[2]) };
}

/** @param {string} t */
function parseVttTime(t) {
  const s = t.replace(/,/, '.').trim();
  const parts = s.split(':');
  if (parts.length === 3) {
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const sec = Number(parts[2]);
    if (!Number.isFinite(h + m + sec)) return null;
    return h * 3600 + m * 60 + sec;
  }
  if (parts.length === 2) {
    const m = Number(parts[0]);
    const sec = Number(parts[1]);
    if (!Number.isFinite(m + sec)) return null;
    return m * 60 + sec;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** @param {string} s */
function stripVttInlineTags(s) {
  return s.replaceAll(/<[^>]+>/g, '');
}
