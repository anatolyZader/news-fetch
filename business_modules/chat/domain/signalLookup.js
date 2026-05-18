/**
 * Signal and report lookup utilities for chat tools.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
} from '../../resilience/domain/services/assessmentDisplayTier.js';

const SIGNALS_DIR = join(import.meta.dirname, '..', '..', '..', 'signals');
const REPORTS_DIR = join(import.meta.dirname, '..', '..', '..', 'reports');

/**
 * Load signals from JSON files, optionally filtered by date and/or source type.
 * @param {{ date?: string, sourceType?: string }} opts
 * @returns {Array} flat array of signal objects with file-level metadata merged in
 */
export function loadSignals({ date, sourceType } = {}) {
  let files;
  try {
    files = readdirSync(SIGNALS_DIR).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }

  if (sourceType) {
    files = files.filter((f) => f.startsWith(`signals-${sourceType}-`));
  }
  if (date) {
    files = files.filter((f) => f.includes(date));
  }

  const results = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(SIGNALS_DIR, f), 'utf-8'));
      const meta = { source_type: raw.source_type, date: raw.date, file: f };
      const sigs = raw.signals ?? [];
      for (let i = 0; i < sigs.length; i++) {
        const sig = sigs[i];
        // Stable per-signal ID so the chat can reference/cite a specific signal.
        const signal_id = `${f}#${i + 1}`;
        results.push({ ...meta, signal_id, ...sig });
      }
    } catch { /* skip corrupt files */ }
  }
  return results;
}

/**
 * Search signals by text query and/or structured filters.
 * @param {Array} signals - flat signal array from loadSignals()
 * @param {{ query?: string, component?: string, sourceType?: string, municipality?: string, limit?: number }} opts
 * @returns {Array} matching signals, capped at limit
 */
export function searchSignals(signals, { query, component, sourceType, municipality, limit = 10 } = {}) {
  let filtered = signals;

  if (sourceType) {
    filtered = filtered.filter((s) => s.source_type === sourceType);
  }

  if (component) {
    // Map component IDs to their signal_type prefixes
    const componentSignalMap = {
      narrative: ['coping_narrative', 'victimhood_narrative', 'helplessness_narrative', 'empowerment_narrative'],
      information_communication: ['information_seeking', 'information_sharing', 'information_confusion', 'rumor_spread', 'information_trust', 'information_distrust'],
      lifesaving_behavior: ['shelter_compliance', 'shelter_noncompliance', 'evacuation_compliance', 'evacuation_refusal', 'emergency_preparedness', 'preparedness_gap'],
      functional_continuity: ['routine_maintenance', 'routine_disruption', 'service_continuity', 'service_gap', 'economic_continuity', 'economic_disruption', 'education_continuity', 'education_disruption', 'coordination_success', 'coordination_failure'],
      community_capital: ['mutual_aid', 'volunteer_action', 'community_initiative', 'social_cohesion', 'social_fragmentation', 'community_organization'],
      leadership: ['leadership_visible_presence', 'leadership_absence', 'leadership_trust', 'leadership_distrust', 'leadership_action', 'leadership_inaction'],
      belonging_solidarity: ['solidarity_expression', 'solidarity_action', 'belonging_expression', 'alienation_expression', 'national_solidarity', 'inter_group_tension'],
      wellbeing_atrisk: ['fear_expression', 'calm_confidence', 'stress_indicator', 'trauma_indicator', 'mental_health_concern', 'welfare_need', 'welfare_response', 'welfare_gap', 'vulnerable_population_concern'],
    };
    const types = componentSignalMap[component];
    if (types) {
      filtered = filtered.filter((s) => types.includes(s.signal_type));
    }
  }

  if (municipality) {
    const q = municipality.toLowerCase();
    filtered = filtered.filter((s) =>
      (s.evidence ?? '').toLowerCase().includes(q) ||
      (s.article_source ?? '').toLowerCase().includes(q),
    );
  }

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((s) =>
      (s.evidence ?? '').toLowerCase().includes(q) ||
      (s.signal_type ?? '').toLowerCase().includes(q) ||
      (s.article_source ?? '').toLowerCase().includes(q),
    );
  }

  return filtered.slice(0, limit);
}

/**
 * Format signals for tool output (concise, readable).
 */
export function formatSignals(signals) {
  if (signals.length === 0) return 'No matching signals found.';
  return signals.map((s, i) =>
    `[${i + 1}] id=${s.signal_id ?? 'unknown'} — ${s.signal_type} (${s.source_type}, ${s.date})` +
    `${s.article_source ? ' — ' + s.article_source : ''}` +
    `\n    ${s.evidence?.slice(0, 300)}` +
    (s.article_url ? `\n    ${s.article_url}` : ''),
  ).join('\n\n');
}

/**
 * Load a resilience report JSON for a given date.
 * Finds the latest report file matching the date.
 * @param {string} date - YYYY-MM-DD
 * @returns {object|null} parsed report or null
 */
export function loadReport(date) {
  let files;
  try {
    files = readdirSync(REPORTS_DIR)
      .filter((f) => f.startsWith(`resilience-report-${date}`) && f.endsWith('.json'))
      .sort();
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  try {
    return JSON.parse(readFileSync(join(REPORTS_DIR, files[files.length - 1]), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * List available report dates (for system context).
 * @returns {string[]} sorted array of YYYY-MM-DD strings
 */
export function listReportDates() {
  let files;
  try {
    files = readdirSync(REPORTS_DIR)
      .filter((f) => f.startsWith('resilience-report-') && f.endsWith('.json'))
      .sort();
  } catch {
    return [];
  }
  const dates = new Set();
  for (const f of files) {
    const m = f.match(/resilience-report-(\d{4}-\d{2}-\d{2})/);
    if (m) dates.add(m[1]);
  }
  return [...dates].sort();
}

/**
 * List available signal source types and dates.
 * @returns {{ sourceTypes: string[], signalDates: string[] }}
 */
export function listSignalMeta() {
  let files;
  try {
    files = readdirSync(SIGNALS_DIR).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return { sourceTypes: [], signalDates: [] };
  }
  const types = new Set();
  const dates = new Set();
  for (const f of files) {
    const m = f.match(/signals-(.+?)-(\d{4}-\d{2}-\d{2})\.json/);
    if (m) {
      types.add(m[1]);
      dates.add(m[2]);
    }
  }
  return { sourceTypes: [...types].sort(), signalDates: [...dates].sort() };
}

/**
 * Compare two report dates — produce per-component deltas.
 * @param {string} dateA - older date (YYYY-MM-DD)
 * @param {string} dateB - newer date (YYYY-MM-DD)
 * @param {{ includeScores?: boolean }} [opts]
 * @returns {string} formatted comparison text
 */
export function compareReports(dateA, dateB, opts = {}) {
  const reportA = loadReport(dateA);
  const reportB = loadReport(dateB);

  if (!reportA && !reportB) return `No reports found for ${dateA} or ${dateB}.`;
  if (!reportA) return `No report found for ${dateA}. Available dates: ${listReportDates().join(', ')}`;
  if (!reportB) return `No report found for ${dateB}. Available dates: ${listReportDates().join(', ')}`;

  const aComps = Object.fromEntries(
    (reportA.assessment.components ?? []).map((c) => [c.component_id, c]),
  );
  const bComps = Object.fromEntries(
    (reportB.assessment.components ?? []).map((c) => [c.component_id, c]),
  );

  const includeScores = opts.includeScores === true;
  const lines = [`Comparison: ${dateA} → ${dateB}\n`];
  if (includeScores) {
    lines.push(
      `Overall: ${reportA.assessment.overall_resilience_score}/10 → ${reportB.assessment.overall_resilience_score}/10`,
    );
  } else {
    lines.push(`Summary A: ${operatorAssessmentSummary(reportA.assessment)}`);
    lines.push(`Summary B: ${operatorAssessmentSummary(reportB.assessment)}`);
  }
  lines.push(`Articles: ${reportA.assessment.total_articles_analyzed} → ${reportB.assessment.total_articles_analyzed}\n`);

  lines.push('Per-component deltas:');
  for (const [id, b] of Object.entries(bComps)) {
    const a = aComps[id];
    if (!a) {
      if (includeScores && b.score != null) {
        lines.push(`  ${id}: NEW ${b.score}/10 (${b.confidence})`);
      } else {
        const inst = b.instrument ?? deriveInstrumentState(b);
        lines.push(`  ${id}: NEW (${inst.confidence}, ${inst.evidence_sufficiency})`);
      }
      continue;
    }
    if (includeScores && a.score != null && b.score != null) {
      const delta = b.score - a.score;
      const arrow = delta > 0 ? '+' : delta < 0 ? '' : '=';
      lines.push(`  ${id}: ${a.score} → ${b.score} (${arrow}${delta}) [${a.confidence} → ${b.confidence}]`);
    } else {
      const instA = a.instrument ?? deriveInstrumentState(a);
      const instB = b.instrument ?? deriveInstrumentState(b);
      lines.push(
        `  ${id}: [${instA.confidence}/${instA.evidence_sufficiency}] → [${instB.confidence}/${instB.evidence_sufficiency}]`,
      );
    }
  }

  // Highlight key narrative differences
  lines.push('\nKey narrative changes:');
  for (const [id, b] of Object.entries(bComps)) {
    const a = aComps[id];
    if (!a) continue;
    const aAbsent = new Set(a.manifestations_absent ?? []);
    const bEvidenced = b.manifestations_evidenced ?? [];
    const newlyEvidenced = bEvidenced.filter((m) => aAbsent.has(m));
    if (newlyEvidenced.length > 0) {
      lines.push(`  ${id}: newly evidenced — ${newlyEvidenced[0].slice(0, 150)}`);
    }
  }

  return lines.join('\n');
}
