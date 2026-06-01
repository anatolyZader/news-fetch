/**
 * Advisory per-component tanhK / certM proposals from historical national reports.
 * Does not modify COMPONENT_TUNING in code.
 */

import { getDefaultStateStore } from '../../../../cross-cut-modules/persistence/infrastructure/fsStateStoreAdapter.js';
const stateStore = getDefaultStateStore();
import { resolve } from 'node:path';
import { COMPONENT_TUNING } from '../../domain/services/behaviorSignals.js';

const TANHK_MIN = 1;
const TANHK_MAX = 4;
const CERTM_MIN = 0.5;
const CERTM_MAX = 4;

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
  if (!stateStore.existsSync(reportsDir)) return [];
  return stateStore.readdirSync(reportsDir).filter(
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
  const netApprox = netEvidence == null
    ? evidenceMass * Math.sign(score - 5.5)
    : netEvidence;
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

function buildComponentProposal(id, rows) {
  const tanhKsamples = rows.map(perRowTanhK).filter((v) => v != null);
  const certMsamples = rows.map(perRowCertM).filter((v) => v != null);

  const proposedK = tanhKsamples.length >= 5
    ? clampNum(median(tanhKsamples), TANHK_MIN, TANHK_MAX)
    : null;
  const proposedM = certMsamples.length >= 5
    ? clampNum(median(certMsamples), CERTM_MIN, CERTM_MAX)
    : null;

  const current = COMPONENT_TUNING[id] ?? null;

  return {
    n_rows: rows.length,
    n_K_samples: tanhKsamples.length,
    n_M_samples: certMsamples.length,
    mean_evidence_mass: mean(rows.map((r) => r.evidenceMass))?.toFixed?.(3) ?? null,
    mean_score: mean(rows.map((r) => r.score))?.toFixed?.(2) ?? null,
    current,
    proposed: {
      tanhK: proposedK == null ? null : Number(proposedK.toFixed(2)),
      certM: proposedM == null ? null : Number(proposedM.toFixed(2)),
    },
    rmse: {
      score_at_current_K: current ? rmseScore(rows, current.tanhK)?.toFixed?.(3) : null,
      score_at_proposed_K: proposedK == null ? null : rmseScore(rows, proposedK)?.toFixed?.(3),
      certainty_at_current_M: current ? rmseCertM(rows, current.certM)?.toFixed?.(3) : null,
      certainty_at_proposed_M: proposedM == null ? null : rmseCertM(rows, proposedM)?.toFixed?.(3),
    },
  };
}

function buildProposalsFromRows(rowsByComponent) {
  const components = {};
  for (const [id, rows] of Object.entries(rowsByComponent)) {
    components[id] = rows.length < 5
      ? { note: 'insufficient_rows', n: rows.length }
      : buildComponentProposal(id, rows);
  }
  return components;
}

/**
 * @param {string} [reportsDir]
 * @param {{ minReports?: number }} [opts]
 * @returns {null | { status: string, report_count: number, skipped_reason?: string, components: object }}
 */
export function proposeComponentTuningFromReportFiles(reportsDir, opts = {}) {
  const dir = reportsDir ? resolve(reportsDir) : resolve(process.cwd(), 'daily_reports');
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
      j = JSON.parse(stateStore.readFileSync(resolve(dir, f), 'utf8'));
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
