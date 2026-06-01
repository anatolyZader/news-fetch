/**
 * Pure filter logic for report component lenses.
 */

export const COMPONENT_IDS = [
  'narrative',
  'information_communication',
  'lifesaving_behavior',
  'functional_continuity',
  'community_capital',
  'leadership',
  'belonging_solidarity',
  'wellbeing_at_risk',
];

export const FILTER_PRESETS = Object.freeze({
  all: 'all',
  needs_attention: 'needs_attention',
  thin: 'thin',
  contested: 'contested',
});

const ATTENTION_LEVELS = new Set(['critical', 'warning', 'watch']);

/**
 * @param {object} comp
 * @param {Array<object>} attentionItems
 */
function componentNeedsAttention(comp, attentionItems) {
  const id = comp.component_id;
  if (!id) return false;
  if ((attentionItems ?? []).some((a) => a.component_id === id && ATTENTION_LEVELS.has(a.level))) {
    return true;
  }
  const inst = comp.instrument ?? {};
  if (inst.presence_gate_triggered) return true;
  if (inst.thin_evidence_instrument === 'critical_presence_failure') return true;
  if (inst.thin_evidence_instrument === 'critical_single_signal') return true;
  if (inst.thin_evidence_instrument === 'unverified_alert') return true;
  return false;
}

/**
 * @param {Array<object>} components
 * @param {{ preset?: string, selectedComponentIds?: string[]|null, attentionItems?: Array<object> }} opts
 * @returns {Array<object>}
 */
export function filterReportComponents(components, opts = {}) {
  const list = components ?? [];
  const preset = opts.preset ?? FILTER_PRESETS.all;
  const selected = opts.selectedComponentIds ?? null;
  const attentionItems = opts.attentionItems ?? [];

  if (Array.isArray(selected) && selected.length > 0) {
    const allowed = new Set(selected);
    return list.filter((c) => allowed.has(c.component_id));
  }

  if (preset === FILTER_PRESETS.all) return list;

  if (preset === FILTER_PRESETS.needs_attention) {
    return list.filter((c) => componentNeedsAttention(c, attentionItems));
  }

  if (preset === FILTER_PRESETS.thin) {
    return list.filter((c) => (c.instrument?.evidence_sufficiency ?? '') === 'thin');
  }

  if (preset === FILTER_PRESETS.contested) {
    return list.filter((c) => {
      const inst = c.instrument ?? {};
      return inst.contested === true || inst.contested_thin === true;
    });
  }

  return list;
}
