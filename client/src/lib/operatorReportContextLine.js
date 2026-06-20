/**
 * Format operator report context one-liner (void level, narrative mode, scope signals).
 * @param {object | null | undefined} assessment
 * @param {{ scopeLabel?: string }} [opts]
 * @returns {{ scopeLabel: string, voidLevel: string, narrativeMode: string, scopeSignalCount: number|null }}
 */
export function deriveOperatorReportContext(assessment, opts = {}) {
  const scopeLabel = opts.scopeLabel
    ?? assessment?.report_scope?.label
    ?? assessment?.report_scope?.id
    ?? 'national';
  const voidLevel = assessment?.data_void?.level ?? 'none';
  const narrativeMode = assessment?.narrative_pipeline_mode ?? 'agent';
  const scopeSignalCount = assessment?.investigation_summary?.signals_narrative_scope
    ?? assessment?.narrative_scope_signal_count
    ?? null;

  return {
    scopeLabel,
    voidLevel,
    narrativeMode,
    scopeSignalCount,
  };
}

/**
 * @param {string} template
 * @param {Record<string, string|number|null>} params
 * @returns {string}
 */
export function formatOperatorContextTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, value == null ? '—' : String(value)),
    template,
  );
}
