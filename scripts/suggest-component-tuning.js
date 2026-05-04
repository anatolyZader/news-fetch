#!/usr/bin/env node
/**
 * Calibrate per-component (tanhK, certM) parameters from accumulated historical
 * resilience reports. ADVISORY ONLY — prints proposed tuning JSON and lets the
 * operator decide whether to update COMPONENT_TUNING in
 *   business_modules/resilience/domain/services/behaviorSignals.js
 * The current defaults stay in code untouched until a human edits them.
 *
 * Math (mirroring scoreFromItems / scoreComponents):
 *   strength       = tanh(net_evidence / tanhK)
 *   adjusted       = strength * coverage_adjustment * source_diversity_factor
 *                    * type_diversity_factor                              (~ 1)
 *   score          = round(5.5 + 4.5 * adjusted)              (clamped to [1,10])
 *   certainty      = 1 - exp(-evidence_mass / certM)
 *
 * tanhK fit:
 *   For each report row we know `net_evidence_i`, the integer `score_i`, and
 *   we approximate `strength_i ≈ (score_i - 5.5) / 4.5`. This inverts to
 *     tanhK_i = net_evidence_i / atanh(strength_i)
 *   when strength_i is in (-1, 1). We use the median of those per-row K
 *   estimates as the proposal — it is robust to the rounding of `score`,
 *   the (currently fixed) coverage / diversity factors, and any outliers.
 *
 *   Reports older than the schema that exposed `evidence_mass` / `net_evidence`
 *   are skipped. Net evidence may be missing on positive-only or negative-only
 *   batches; in that case we approximate net_evidence ≈ evidence_mass *
 *   sign(score - 5.5) so the row still contributes.
 *
 * certM fit:
 *   1 - exp(-evidence_mass / certM) ≈ certainty
 *   ⇒ certM = -evidence_mass / ln(1 - certainty)
 *   We compute that closed-form per row and again take the median.
 *
 * Usage:
 *   node scripts/suggest-component-tuning.js               # current vs proposed
 *   node scripts/suggest-component-tuning.js --diff        # only rows that move
 *   REPORTS_DIR=/path/to/reports node scripts/suggest-component-tuning.js
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { COMPONENT_TUNING }
  from '../business_modules/resilience/domain/services/behaviorSignals.js';

const reportsDir = process.env.REPORTS_DIR
  ? resolve(process.env.REPORTS_DIR)
  : resolve(process.cwd(), 'reports');

const args = new Set(process.argv.slice(2));
const DIFF_ONLY = args.has('--diff');

// Bounds for the proposed values — we never recommend something pathological.
const TANHK_MIN = 1.0;
const TANHK_MAX = 4.0;
const CERTM_MIN = 0.5;
const CERTM_MAX = 4.0;

function loadReportFiles() {
  if (!existsSync(reportsDir)) return [];
  // National-only: north reports are filtered through a different signal mass scale.
  return readdirSync(reportsDir).filter(
    (f) => f.startsWith('resilience-report-') && f.endsWith('.json') && !f.includes('-north-'),
  );
}

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

function main() {
  const files = loadReportFiles();
  if (files.length === 0) {
    console.error(`No national reports found in ${reportsDir}`);
    process.exit(1);
  }

  const rowsByComponent = {};
  for (const f of files) {
    let j;
    try {
      j = JSON.parse(readFileSync(resolve(reportsDir, f), 'utf8'));
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

  const proposals = {};
  for (const [id, rows] of Object.entries(rowsByComponent)) {
    if (rows.length < 5) {
      proposals[id] = { note: 'insufficient_rows', n: rows.length };
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

    proposals[id] = {
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

  let output;
  if (DIFF_ONLY) {
    output = {};
    for (const [id, p] of Object.entries(proposals)) {
      if (!p.current || !p.proposed) continue;
      const movedK = p.proposed.tanhK != null && Math.abs(p.proposed.tanhK - p.current.tanhK) > 0.05;
      const movedM = p.proposed.certM != null && Math.abs(p.proposed.certM - p.current.certM) > 0.05;
      if (movedK || movedM) output[id] = p;
    }
    if (Object.keys(output).length === 0) {
      console.log(JSON.stringify({
        reportsDir, n_files: files.length,
        message: 'No component proposals moved by more than 0.05 from current.',
      }, null, 2));
      return;
    }
  } else {
    output = proposals;
  }

  console.log(JSON.stringify({
    reportsDir,
    n_files: files.length,
    advisory: 'Proposals are advisory. Current COMPONENT_TUNING in code stays untouched until a human edits it.',
    components: output,
  }, null, 2));
}

main();
