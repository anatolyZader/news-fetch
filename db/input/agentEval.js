#!/usr/bin/env node
/**
 * Agent eval harness — grounding, abstention, contested, dominance suites.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCriticChecks } from '../../business_modules/specialist_agents/app/criticAgent.js';
import { computeDivergence } from '../../business_modules/specialist_agents/domain/services/shadowArtifacts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function loadFixtures() {
  const path = resolve(repoRoot, 'tests/fixtures/agent-eval/agent-eval-fixtures.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function checkClaimsHaveRefs(assessment, errors) {
  for (const c of assessment.claims ?? []) {
    if (!c.evidence_refs?.length) errors.push('missing evidence_refs');
  }
}

function checkMustAbstain(fx, assessment, epistemic, errors) {
  if (fx.expect.must_abstain && assessment.severity !== 'abstain') {
    errors.push(`expected abstain got ${assessment.severity}`);
  }
  const critic = runCriticChecks(assessment, epistemic);
  if (fx.expect.must_abstain && critic.issues.some((i) => i.type === 'thin_evidence_strong_claim')) {
    errors.push('critic flagged thin_evidence_strong_claim');
  }
}

function checkDissentSummary(fx, assessment, errors) {
  if (fx.expect.has_dissent_summary && !assessment.dissent_summary) {
    errors.push('missing dissent_summary for contested');
  }
}

function checkDominanceMention(fx, assessment, errors) {
  if (!fx.expect.mentions_dominance) return;
  const narrative = String(assessment.narrative ?? '').toLowerCase();
  if (!narrative.includes('telegram') && !narrative.includes('source') && !narrative.includes('cap')) {
    errors.push('dominance not mentioned in narrative');
  }
}

function checkDivergenceAligned(fx, errors) {
  if (!fx.expect.divergence_aligned) return;
  const { agent_assessment: agent, shadow_scored: shadow } = fx.divergence_case ?? {};
  const divergence = computeDivergence(agent, shadow);
  const comp = divergence.by_component?.leadership;
  if (!comp?.aligned) errors.push('divergence not aligned for leadership');
}

function checkDeterministicShape(fx, errors) {
  const assessment = fx.deterministic_assessment;
  if (!assessment) return;
  if (fx.expect.degraded_mode && assessment.assessment_degraded?.mode !== fx.expect.degraded_mode) {
    errors.push(`expected degraded mode ${fx.expect.degraded_mode}`);
  }
  if (fx.expect.has_instruments) {
    for (const c of assessment.components ?? []) {
      if (!c.instrument) errors.push(`missing instrument on ${c.component_id}`);
    }
  }
}

function evalFixture(fx) {
  const errors = [];
  const assessment = fx.component_assessment;
  const epistemic = fx.epistemic_profile ?? { by_component: {} };

  if (fx.divergence_case) {
    checkDivergenceAligned(fx, errors);
    return errors;
  }
  if (fx.deterministic_assessment) {
    checkDeterministicShape(fx, errors);
    return errors;
  }

  if (fx.expect.all_claims_have_refs) checkClaimsHaveRefs(assessment, errors);
  checkMustAbstain(fx, assessment, epistemic, errors);
  checkDissentSummary(fx, assessment, errors);
  checkDominanceMention(fx, assessment, errors);

  return errors;
}

async function main() {
  const fixtures = loadFixtures();
  let pass = 0;
  let fail = 0;

  for (const fx of fixtures) {
    const errors = evalFixture(fx);
    if (errors.length === 0) {
      console.log(`PASS  ${fx.id}`);
      pass += 1;
    } else {
      console.log(`FAIL  ${fx.id}: ${errors.join('; ')}`);
      fail += 1;
    }
  }

  console.log(`agent:eval ${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

try {
  await main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
