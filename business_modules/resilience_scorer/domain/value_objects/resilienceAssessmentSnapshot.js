import { DISPLAY_VIEWS, resolveDisplayView } from '../../../../cross-cut-modules/resilience-contracts/displayViews.js';
import { normalizeReportScope } from '../../../../cross-cut-modules/resilience-contracts/scopePolicy.js';

/**
 * Snapshot invariants for a resilience assessment at API boundaries.
 */
export class ResilienceAssessmentSnapshot {
  /**
   * @param {{ assessment: object, displayView?: string, reportScopeId?: string }} fields
   */
  constructor(fields) {
    this.assessment = fields.assessment ?? {};
    this.displayView = fields.displayView ?? DISPLAY_VIEWS.operator;
    this.reportScopeId = normalizeReportScope(
      fields.reportScopeId ?? this.assessment?.report_scope?.id ?? 'national',
    );
  }

  /**
   * @param {object|null} assessment
   * @param {{ queryView?: string, canViewAnalyst?: boolean }} [opts]
   */
  static fromAssessment(assessment, opts = {}) {
    const displayView = resolveDisplayView(opts);
    return new ResilienceAssessmentSnapshot({
      assessment: assessment ?? {},
      displayView,
      reportScopeId: assessment?.report_scope?.id,
    });
  }

  isAnalystView() {
    return this.displayView === DISPLAY_VIEWS.analyst;
  }

  scopeLabel() {
    return this.assessment?.report_scope?.label ?? this.reportScopeId;
  }
}
