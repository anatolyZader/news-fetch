/**
 * Suppression / data-quality context for narrative prompts and validators.
 */

export const SUPPRESSION_CAVEAT_KEYWORDS = [
  'source cap',
  'source_cap',
  'single-source',
  'single source',
  'outlet',
  'concentration',
  'dominant',
  'thin evidence',
  'thin_evidence',
  'evidence floor',
  'floor',
  'source_cap_effect',
  'thin_evidence_floor',
  'source_cap_binding',
  'suppression',
  'headline',
  'raw',
  'limited',
  'concentrated',
];

const SUPPRESSION_EFFECT_THRESHOLD = 0.5;

/**
 * @param {object|null|undefined} scored
 */
export function componentNeedsSuppressionCompliance(scored) {
  if (!scored) return false;

  const delta = scored.suppression_delta;
  if (delta != null && Math.abs(delta) >= 1) return true;
  if (scored.source_cap_binding === true) return true;
  if (scored.floor_clamped === true) return true;

  const breakdown = scored.suppression_breakdown ?? {};
  if (breakdown.source_cap != null && Math.abs(breakdown.source_cap) >= SUPPRESSION_EFFECT_THRESHOLD) {
    return true;
  }
  if (breakdown.min_mass_floor != null && Math.abs(breakdown.min_mass_floor) >= SUPPRESSION_EFFECT_THRESHOLD) {
    return true;
  }
  return false;
}

/**
 * @param {object|null|undefined} scored
 */
export function formatSuppressionTraceTag(scored) {
  if (!componentNeedsSuppressionCompliance(scored)) return '';

  const delta = scored.suppression_delta;
  const binding = scored.source_cap_binding === true;
  const raw = scored.score_raw ?? scored.score;
  const headline = scored.score_headline ?? scored.score;
  const parts = [`raw→headline Δ=${delta ?? 0}`];
  if (raw != null && headline != null) {
    parts.unshift(`raw=${raw} headline=${headline}`);
  }

  const breakdown = scored.suppression_breakdown ?? {};
  if (breakdown.source_cap != null && Math.abs(breakdown.source_cap) >= SUPPRESSION_EFFECT_THRESHOLD) {
    const sign = breakdown.source_cap > 0 ? '+' : '';
    parts.push(`source_cap_effect=${sign}${breakdown.source_cap}`);
  }
  if (breakdown.min_mass_floor != null && Math.abs(breakdown.min_mass_floor) >= SUPPRESSION_EFFECT_THRESHOLD) {
    const sign = breakdown.min_mass_floor > 0 ? '+' : '';
    parts.push(`thin_evidence_floor=${sign}${breakdown.min_mass_floor}`);
  }
  if (binding) parts.push('SOURCE_CAP_BINDING');
  if (scored.floor_clamped === true && !parts.some((p) => p.includes('thin_evidence_floor'))) {
    parts.push('thin_evidence_floor_applied');
  }

  return `  SUPPRESSION_TRACE: ${parts.join(' ')}`;
}

function topContributorsFromSignals(signals, limit = 3) {
  return (signals ?? [])
    .filter((s) => typeof s._contribution === 'number')
    .sort((a, b) => Math.abs(b._contribution) - Math.abs(a._contribution))
    .slice(0, limit);
}

/**
 * @param {object|null|undefined} signal
 */
export function formatSignalContributionSuffix(signal) {
  if (!signal || typeof signal._contribution !== 'number') return '';
  const raw = signal._contribution_raw ?? signal._contribution_pre_cap ?? signal._contribution;
  const capped = signal._contribution;
  const layer = signal._cap_layer ?? 'none';
  const parts = [`contrib: raw=${Number(raw).toFixed(2)} capped=${Number(capped).toFixed(2)}`];
  if (layer !== 'none') parts.push(`cap_layer=${layer}`);
  if (signal._cap_scale_factor != null) parts.push(`scale=${Number(signal._cap_scale_factor).toFixed(2)}`);
  return `  ${parts.join(' ')}`;
}

function formatDiversityAdjustmentLine(scored) {
  const cov = scored.coverage_adjustment ?? 0;
  const srcDiv = scored.source_diversity_factor ?? 0;
  const typeDiv = scored.type_diversity_factor ?? 0;
  if (Math.abs(cov) < 0.3 && Math.abs(srcDiv) < 0.05 && Math.abs(typeDiv) < 0.05) {
    return '';
  }
  return (
    `  DIVERSITY_ADJUSTMENT: coverage=${cov} source_div=${srcDiv} type_div=${typeDiv}`
  );
}

/**
 * @param {object|null|undefined} scored
 */
export function formatSuppressionDataQualityBlock(scored) {
  if (!scored) return '';

  const lines = [];
  const derived = scored.derived_indicators ?? {};
  if (derived.dominant_outlet_key) {
    lines.push(`  dominant_outlet=${derived.dominant_outlet_key}`);
  }
  if (derived.outlet_concentration_warning === true) {
    lines.push('  outlet_concentration_warning=true');
  }

  const contributors = topContributorsFromSignals(scored.signals, 3);
  if (contributors.length > 0) {
    lines.push('  Top contributors (raw→capped):');
    for (const s of contributors) {
      const type = s.signal_type ?? s.type ?? 'unknown';
      const src = s.article_source ?? 'unknown';
      const raw = s._contribution_raw ?? s._contribution_pre_cap ?? s._contribution;
      const capped = s._contribution;
      const layer = s._cap_layer ?? 'none';
      lines.push(
        `    - ${type} @ ${src}: raw=${Number(raw).toFixed(2)} → capped=${Number(capped).toFixed(2)} (${layer})`,
      );
    }
  }

  const diversity = formatDiversityAdjustmentLine(scored);
  if (diversity) lines.push(diversity);

  if (!componentNeedsSuppressionCompliance(scored) && lines.length === 0) return '';
  if (lines.length === 0) return '';

  return `Data quality context:\n${lines.join('\n')}\n`;
}

/**
 * @param {string} caveat
 * @param {object|null|undefined} scored
 */
export function caveatReferencesSuppressionReason(caveat, scored) {
  const text = String(caveat ?? '').toLowerCase();
  if (!text.trim()) return false;

  const keywordHit = SUPPRESSION_CAVEAT_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
  const outlet = scored?.derived_indicators?.dominant_outlet_key;
  const outletHit = outlet && text.includes(String(outlet).toLowerCase().replace(/^www\./, ''));
  return keywordHit || outletHit;
}
