/**
 * Bucket chat sessions into Today / This week / Older by report_date.
 */

function isoDaysBefore(todayStr, days) {
  const d = new Date(`${todayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * @param {Array<{ report_date?: string }>} sessions already sorted by updated_at DESC
 * @param {string} todayStr YYYY-MM-DD in the app timezone
 * @returns {Array<{ key: 'today'|'thisWeek'|'older', sessions: Array<object> }>} non-empty groups only
 */
export function groupSessionsByRecency(sessions, todayStr) {
  const weekFloor = isoDaysBefore(todayStr, 6);
  const buckets = { today: [], thisWeek: [], older: [] };
  for (const s of sessions ?? []) {
    const date = String(s?.report_date ?? '');
    if (date === todayStr) buckets.today.push(s);
    else if (date >= weekFloor && date < todayStr) buckets.thisWeek.push(s);
    else buckets.older.push(s);
  }
  return [
    { key: 'today', sessions: buckets.today },
    { key: 'thisWeek', sessions: buckets.thisWeek },
    { key: 'older', sessions: buckets.older },
  ].filter((g) => g.sessions.length > 0);
}
