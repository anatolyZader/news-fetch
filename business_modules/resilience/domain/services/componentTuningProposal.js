/**
 * Advisory per-component tanhK / certM proposals from historical national reports.
 * Does not modify COMPONENT_TUNING in code.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMPONENT_TUNING } from './behaviorSignals.js';

const TANHK_MIN = 1.0;
const TANHK_MAX = 4.0;
const CERTM_MIN = 0.5;
const CERTM_MAX = 4.0;

function median(arr) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 === 1
    ? sorted[Math.floor(mid)]
    : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, x) => s + x, 0) / arr.length;
}

function clampNum(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function loadNationalReportFiles(reportsDir) {
  if (!existsSync(reportsDir)) return [];
  return readdirSync(reportsDir).filter(
    (f) => f.startsWith('resilience-report-') && f.endsWith('.json') && !f.includes('-north-'),
  );
}

function rowToFitInputs(c) {
  const id = c.component_id;
  const score = typeof c.score === 'number' ? c.score : null;
  const evidenceMass = typeof c.evidence_mass === 'number' ? c.evidence_mass : null;
  const netEvidence = typeof c.net_evidence === 'number' ? c.net_evidence : null;
  const certainty = typeof c.certainty === 'number' ? c.certainty : null;
  if (!id || score == null || evidenceMass == null) return null;
  const netApprox = netEvidence != null
    ? netEvidence
    : evidenceMass * Math.sign(score - 5.5);
  return { id, score, evidenceMass, netEvidence: netApprox, certainty };
}

function perRowTanhK(row) {
  const strength = (row.score - 5.5) / 4.5;
  if (Math.abs(strength) >= 0.999) return null;
  if (Math.abs(row.netEvidence) < 0.05) return null;
  const ah = Math.atanh(strength);
  if (Math.abs(ah) < 1e-6) return null;
  const k = row.netEvidence / ah;
  if (!Number.isFinite(k) || k <= 0) return null;
  return k;
}

function perRowCertM(row) {
  if (row.certainty == null || row.certainty <= 0 || row.certainty >= 0.9999) return null;
  if (row.evidenceMass <= 0) return null;
  const m = -row.evidenceMass / Math.log(1 - row.certainty);
  if (!Number.isFinite(m) || m <= 0) return null;
  return m;
}

function rmseScore(rows, K) {
  if (!rows.length) return null;
  let acc = 0;
  let n = 0;
  for (const r of rows) {
    const predicted = clampNum(Math.round(5.5 + 4.5 * Math.tanh(r.netEvidence / K)), 1, 10);
    acc += (predicted - r.score) ** 2;
    n += 1;
  }
  return n > 0 ? Math.sqrt(acc / n) : null;
}

function rmseCertM(rows, M) {
  if (!rows.length) return null;
  let acc = 0;
  let n = 0;
  for (const r of rows) {
    if (r.certainty == null || r.evidenceMass <= 0) continue;
    const predicted = 1 - Math.exp(-r.evidenceMass / M);
    acc += (predicted - r.certainty) ** 2;
    n += 1;
  }
  return n > 0 ? Math.sqrt(acc / n) : null;
}

function buildProposalsFromRows(rowsByComponent) {
  const components = {};
  for (const [id, rows] of Object.entries(rowsByComponent)) {
    if (rows.length < 5) {
      components[id] = { note: 'insufficient_rows', n: rows.length };
      continue;
    }
    const tanhKsamples = rows.map(perRowTanhK).filter((v) => v != null);
    const certMsamples = rows.map(perRowCertM).filter((v) => v != null);

    const proposedK = tanhKsamples.length >= 5
      ? clampNum(median(tanhKsamples), TANHK_MIN, TANHK_MAX)
      : null;
    const proposedM = certMsamples.length >= 5
      ? clampNum(median(certMsamples), CERTM_MIN, CERTM_MAX)
      : null;

    const current = COMPONENT_TUNING[id] ?? null;

    components[id] = {
      n_rows: rows.length,
      n_K_samples: tanhKsamples.length,
      n_M_samples: certMsamples.length,
      mean_evidence_mass: mean(rows.map((r) => r.evidenceMass))?.toFixed?.(3) ?? null,
      mean_score: mean(rows.map((r) => r.score))?.toFixed?.(2) ?? null,
      current,
      proposed: {
        tanhK: proposedK != null ? Number(proposedK.toFixed(2)) : null,
        certM: proposedM != null ? Number(proposedM.toFixed(2)) : null,
      },
      rmse: {
        score_at_current_K: current ? rmseScore(rows, current.tanhK)?.toFixed?.(3) : null,
        score_at_proposed_K: proposedK != null ? rmseScore(rows, proposedK)?.toFixed?.(3) : null,
        certainty_at_current_M: current ? rmseCertM(rows, current.certM)?.toFixed?.(3) : null,
        certainty_at_proposed_M: proposedM != null ? rmseCertM(rows, proposedM)?.toFixed?.(3) : null,
      },
    };
  }
  return components;
}

/**
 * @param {string} [reportsDir]
 * @param {{ minReports?: number }} [opts]
 * @returns {null | { status: string, report_count: number, skipped_reason?: string, components: object }}
 */
export function proposeComponentTuningFromReportFiles(reportsDir, opts = {}) {
  const dir = reportsDir ? resolve(reportsDir) : resolve(process.cwd(), 'reports');
  const minReports = opts.minReports ?? 10;
  const files = loadNationalReportFiles(dir);

  if (files.length < minReports) {
    return {
      status: 'advisory_only',
      report_count: files.length,
      skipped_reason: `need_at_least_${minReports}_national_reports`,
      components: {},
    };
  }

  const rowsByComponent = {};
  for (const f of files) {
    let j;
    try {
      j = JSON.parse(readFileSync(resolve(dir, f), 'utf8'));
    } catch {
      continue;
    }
    const comps = j?.assessment?.components ?? [];
    for (const c of comps) {
      const row = rowToFitInputs(c);
      if (!row) continue;
      if (!rowsByComponent[row.id]) rowsByComponent[row.id] = [];
      rowsByComponent[row.id].push(row);
    }
  }

  return {
    status: 'advisory_only',
    report_count: files.length,
    components: buildProposalsFromRows(rowsByComponent),
  };
}
