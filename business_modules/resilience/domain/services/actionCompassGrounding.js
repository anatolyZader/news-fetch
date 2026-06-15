/**
 * Action compass — deterministic grounding context.
 * Extracts named places, channel health, quarantine timing, and social-channel
 * facts from an assessment so both the compass phrasing (no LLM) and the
 * decision-brief payload (LLM) can produce specific, operator-actionable text.
 */

/**
 * @param {string|null|undefined} sinceIso
 * @param {string|null|undefined} dateRef assessment date (YYYY-MM-DD) or ISO
 * @returns {number|null} whole days elapsed since `sinceIso`
 */
export function daysSince(sinceIso, dateRef) {
  if (!sinceIso) return null;
  const since = Date.parse(sinceIso);
  if (Number.isNaN(since)) return null;
  const ref = dateRef ? Date.parse(dateRef) : Date.now();
  const refMs = Number.isNaN(ref) ? Date.now() : ref;
  const diff = Math.floor((refMs - since) / 86_400_000);
  return Math.max(0, diff);
}

/**
 * Human-readable cluster label from an affected_clusters entry.
 * @param {object} entry
 * @returns {string}
 */
function clusterLabel(entry) {
  const key = entry?.cluster ?? '';
  if (!key || key === '_global') return '';
  return String(key).replaceAll('_', ' ').trim();
}

/**
 * @param {object|null|undefined} assessment
 * @returns {{
 *   date: string|null,
 *   digital_darkness: boolean,
 *   vacuum_index: number|null,
 *   cluster_count: number,
 *   cluster_names: string[],
 *   dark_channels: string[],
 *   quarantine: { active: boolean, since: string|null, day_count: number|null, reason: string|null, count: number },
 *   social: { osint_count: number, polarization: number|null, telegram_count: number },
 *   geo_unknown_count: number,
 * }}
 */
export function buildGroundingContext(assessment, opts = {}) {
  const a = assessment && typeof assessment === 'object' ? assessment : {};
  const dataVoid = a.data_void ?? {};
  const date = a.date ?? null;

  const affected = Array.isArray(dataVoid.affected_clusters) ? dataVoid.affected_clusters : [];
  const clusterEntries = affected.filter((c) => c?.cluster && c.cluster !== '_global');
  const clusterNames = [...new Set(clusterEntries.map(clusterLabel).filter(Boolean))];

  const darkChannels = [...new Set(
    affected
      .filter((c) => c?.reason === 'channel_drop' || c?.source_type)
      .map((c) => String(c.source_type ?? '').replaceAll('_', ' ').trim())
      .filter(Boolean),
  )];

  const qState = a.digital_quarantine_state ?? null;
  const qToday = a.quarantined_digital ?? null;
  const since = qState?.since ?? null;
  const quarantine = {
    active: qState?.active === true || (qToday?.count ?? 0) > 0,
    since,
    day_count: daysSince(since, date),
    reason: qState?.reason ?? qToday?.reason ?? null,
    count: qToday?.count ?? qState?.quarantined_count ?? 0,
  };

  const social = a.social_channel_quarantine ?? null;
  const socialCtx = {
    osint_count: social?.osint_signal_count ?? social?.social_signal_count ?? 0,
    polarization: social?.osint_polarization ?? social?.social_polarization ?? null,
    telegram_count: social?.telegram_signal_count ?? 0,
  };

  return {
    date,
    digital_darkness: dataVoid.digital_darkness === true,
    vacuum_index: typeof dataVoid.information_vacuum_index === 'number'
      ? dataVoid.information_vacuum_index
      : null,
    cluster_count: clusterEntries.length,
    cluster_names: clusterNames,
    dark_channels: darkChannels,
    quarantine,
    social: socialCtx,
    geo_unknown_count: opts.geoUnknownCount ?? 0,
  };
}
