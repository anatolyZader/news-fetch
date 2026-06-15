/**
 * Action compass — per-kind operator phrasing.
 * Produces i18n keys + params (resolved client-side) for title, "why now", and a
 * "success signal" so each action reads as a decision, not a field dump.
 */

import { ACTION_KINDS, KIND_I18N } from './actionCompassKinds.js';

function tplKey(kind, suffix) {
  return `actionCompass.tpl.${KIND_I18N[kind] ?? kind}.${suffix}`;
}

/**
 * @param {object} action merged action { kind, source, ground, analyst_detail, evidence_codes }
 * @param {object} ground grounding context from buildGroundingContext
 * @returns {{
 *   title_key: string,
 *   why_now_key: string|null,
 *   why_now_params: object,
 *   success_signal_key: string,
 *   detail_params: object,
 * }}
 */
export function phraseAction(action, ground = {}) {
  const kind = action?.kind ?? ACTION_KINDS.corroborate;
  const base = {
    title_key: tplKey(kind, 'title'),
    why_now_key: tplKey(kind, 'whyNow'),
    why_now_params: {},
    success_signal_key: tplKey(kind, 'success'),
    detail_params: {},
  };

  switch (kind) {
    case ACTION_KINDS.repair_sampling: {
      const channels = (ground.dark_channels ?? []).join(', ');
      const count = ground.quarantine?.count ?? 0;
      if (channels) {
        base.why_now_key = tplKey(kind, 'whyNowChannels');
        base.why_now_params = { channels };
      } else {
        base.why_now_params = { count };
      }
      base.detail_params = { count, channels: channels || null };
      break;
    }
    case ACTION_KINDS.communicate: {
      const keywords = action.analyst_detail?.keywords
        || (Array.isArray(action.analyst_detail?.top_cluster_keywords)
          ? action.analyst_detail.top_cluster_keywords.join(', ')
          : '');
      if (keywords) {
        base.why_now_params = { keywords };
      } else {
        base.why_now_key = tplKey(kind, 'whyNowPlain');
      }
      break;
    }
    case ACTION_KINDS.allocate: {
      const names = ground.cluster_names ?? [];
      const count = Math.max(
        ground.cluster_count ?? 0,
        ground.geo_unknown_count ?? 0,
        names.length,
      );
      if (names.length > 0) {
        base.why_now_key = tplKey(kind, 'whyNowNamed');
        base.why_now_params = { clusters: names.join(', '), count };
      } else {
        base.why_now_params = { count };
      }
      base.detail_params = { count, clusters: names.join(', ') || null };
      break;
    }
    case ACTION_KINDS.monitor: {
      const since = ground.quarantine?.since ? String(ground.quarantine.since).slice(0, 10) : null;
      const days = ground.quarantine?.day_count ?? null;
      base.why_now_params = { since, days };
      base.detail_params = { since, days };
      break;
    }
    case ACTION_KINDS.corroborate:
    case ACTION_KINDS.investigate:
    case ACTION_KINDS.escalate:
    default:
      break;
  }

  return base;
}
