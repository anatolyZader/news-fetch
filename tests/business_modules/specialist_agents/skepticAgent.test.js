import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runSkepticChecks } from '../../../business_modules/specialist_agents/app/skepticAgent.js';

function signal(type, articleIndex, evidence) {
  return {
    article_index: articleIndex,
    article_url: null,
    signal_type: type,
    evidence_type: 'observational_reported_fact',
    evidence,
    scope_level: 'local_or_single',
    article_source: 'radio — test',
    source_type: 'radio',
  };
}

function assessment(claims) {
  return {
    component_id: 'leadership',
    severity: 'moderate',
    confidence: 'high',
    narrative: 'n',
    claims,
  };
}

/** Kernel stub recording every call so context isolation can be asserted. */
function stubKernel(verdicts) {
  const calls = [];
  let i = 0;
  return {
    calls,
    run: async (opts) => {
      calls.push(opts);
      const payload = verdicts[i] ?? { verdict: 'keep', reason_code: 'evidence_supports', rationale: 'ok' };
      i += 1;
      return { submitPayloads: [{ tool: 'submit_claim_verdict', payload }] };
    },
  };
}

describe('skepticAgent', () => {
  const signals = [signal('leadership_signal', 1, 'Mayor of Kiryat Shmona held a briefing.')];

  it('sends the claim and its evidence and nothing else — no narrative, no sibling claims', async () => {
    const refKey = 'leadership_signal@idx:1';
    const kernel = stubKernel([{ verdict: 'keep', reason_code: 'evidence_supports', rationale: 'ok' }]);
    await runSkepticChecks({
      assessment: assessment([
        { claim_id: 'c1', text: 'A briefing was held in Kiryat Shmona.', evidence_refs: [refKey] },
        { claim_id: 'c2', text: 'Sibling claim that must not leak.', evidence_refs: [refKey] },
      ]),
      signals,
      agentKernel: kernel,
      sampleSize: 1,
    });

    assert.equal(kernel.calls.length, 1);
    const content = kernel.calls[0].messages[0].content;
    assert.match(content, /A briefing was held in Kiryat Shmona/);
    assert.match(content, /Mayor of Kiryat Shmona held a briefing/);
    assert.doesNotMatch(content, /Sibling claim/);
    // The whole point of the node: it cannot inherit the specialist's reasoning.
    assert.equal(kernel.calls[0].messages.length, 1);
  });

  it('names unresolved refs instead of letting them read as an overstated claim', async () => {
    const kernel = stubKernel([]);
    await runSkepticChecks({
      assessment: assessment([
        { claim_id: 'c1', text: 'Claim.', evidence_refs: ['leadership_signal@idx:1', 'leadership_signal@idx:999'] },
      ]),
      signals,
      agentKernel: kernel,
      sampleSize: 1,
    });
    assert.match(kernel.calls[0].messages[0].content, /1 cited ref\(s\) could not be resolved/);
  });

  it('returns keep and flags the failure when the kernel throws', async () => {
    const kernel = { run: async () => { throw new Error('rate limited'); } };
    const result = await runSkepticChecks({
      assessment: assessment([{ claim_id: 'c1', text: 'Claim.', evidence_refs: ['leadership_signal@idx:1'] }]),
      signals,
      agentKernel: kernel,
      sampleSize: 1,
    });
    assert.equal(result.verdicts[0].verdict, 'keep');
    assert.equal(result.verdicts[0].failed, true);
    // A dead node must not read as an approval.
    assert.equal(result.failures, 1);
  });

  it('returns keep when the model ends without submitting a verdict', async () => {
    const kernel = { run: async () => ({ submitPayloads: [] }) };
    const result = await runSkepticChecks({
      assessment: assessment([{ claim_id: 'c1', text: 'Claim.', evidence_refs: ['leadership_signal@idx:1'] }]),
      signals,
      agentKernel: kernel,
      sampleSize: 1,
    });
    assert.equal(result.verdicts[0].verdict, 'keep');
    assert.equal(result.failures, 1);
  });

  it('spends nothing when the policy selects no claims', async () => {
    const kernel = stubKernel([]);
    const result = await runSkepticChecks({
      assessment: { ...assessment([]), severity: 'abstain' },
      signals,
      agentKernel: kernel,
      sampleSize: 3,
    });
    assert.equal(kernel.calls.length, 0);
    assert.deepEqual(result, { verdicts: [], sampled: 0, failures: 0 });
  });

  it('coerces an unexpected verdict value to keep', async () => {
    const kernel = stubKernel([{ verdict: 'maybe', reason_code: 'evidence_supports', rationale: 'x' }]);
    const result = await runSkepticChecks({
      assessment: assessment([{ claim_id: 'c1', text: 'Claim.', evidence_refs: ['leadership_signal@idx:1'] }]),
      signals,
      agentKernel: kernel,
      sampleSize: 1,
    });
    assert.equal(result.verdicts[0].verdict, 'keep');
  });
});
