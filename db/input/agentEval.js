#!/usr/bin/env node
/**
 * Agent eval harness — grounding, abstention, contested, dominance suites.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCriticChecks } from '../../business_modules/resilience_assessment/app/criticAgent.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

function loadFixtures() {
  const path = resolve(repoRoot, 'tests/fixtures/agent-eval/agent-eval-fixtures.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function evalFixture(fx) {
  const errors = [];
  const assessment = fx.component_assessment;
  const epistemic = fx.epistemic_profile ?? { by_component: {} };

  if (fx.expect.all_claims_have_refs) {
    for (const c of assessment.claims ?? []) {
      if (!c.evidence_refs?.length) errors.push('missing evidence_refs');
    }
  }

  if (fx.expect.must_abstain && assessment.severity !== 'abstain') {
    errors.push(`expected abstain got ${assessment.severity}`);
  }

  if (fx.expect.has_dissent_summary && !assessment.dissent_summary) {
    errors.push('missing dissent_summary for contested');
  }

  if (fx.expect.mentions_dominance) {
    const narrative = String(assessment.narrative ?? '').toLowerCase();
    if (!narrative.includes('telegram') && !narrative.includes('source') && !narrative.includes('cap')) {
      errors.push('dominance not mentioned in narrative');
    }
  }

  const critic = runCriticChecks(assessment, epistemic);
  if (fx.expect.must_abstain && critic.issues.some((i) => i.type === 'thin_evidence_strong_claim')) {
    errors.push('critic flagged thin_evidence_strong_claim');
  }

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

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
