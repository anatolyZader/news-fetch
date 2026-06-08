/**
 * Anthropic Message Batches API adapter (opt-in for offline extraction).
 */
import Anthropic from '@anthropic-ai/sdk';
import { logLlmInvocation } from './llmInvocationLog.js';
import { calcLlmCostUsd } from './llmPricing.js';
import { prepareAnthropicRequest } from './promptCache.js';

/**
 * @param {{ apiKey?: string, client?: object }} [cfg]
 */
export function createAnthropicBatchAdapter(cfg = {}) {
  const client = cfg.client ?? (cfg.apiKey ? new Anthropic({ apiKey: cfg.apiKey }) : new Anthropic());

  async function submitBatch(requests) {
    const batch = await client.messages.batches.create({
      requests: requests.map((r) => {
        const feature = r.callContext?.feature ?? 'extract';
        const prepared = prepareAnthropicRequest(
          { ...r.params, callContext: r.callContext },
          { feature },
        );
        const params = { ...prepared };
        delete params.callContext;
        return { custom_id: r.custom_id, params };
      }),
    });
    return batch.id;
  }

  async function pollUntilComplete(batchId, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 86_400_000;
    const intervalMs = opts.intervalMs ?? 15_000;
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const batch = await client.messages.batches.retrieve(batchId);
      if (batch.processing_status === 'ended') return batch;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(`batch ${batchId} timed out after ${timeoutMs}ms`);
  }

  async function collectResults(batchId) {
    const out = new Map();
    for await (const item of client.messages.batches.results(batchId)) {
      out.set(item.custom_id, item);
    }
    return out;
  }

  /**
   * @param {Array<{ custom_id: string, params: object, callContext?: object }>} requests
   */
  async function runBatch(requests, opts = {}) {
    const batchId = await submitBatch(requests);
    console.error(`  → submitted Anthropic batch ${batchId} (${requests.length} requests)`);
    await pollUntilComplete(batchId, opts);
    const results = await collectResults(batchId);

    const parsed = new Map();
    for (const req of requests) {
      const item = results.get(req.custom_id);
      if (!item) {
        parsed.set(req.custom_id, { ok: false, error: 'missing_result' });
        continue;
      }
      if (item.result?.type === 'succeeded') {
        const message = item.result.message;
        logLlmInvocation({
          callContext: req.callContext ?? { feature: 'extract_batch' },
          model: req.params?.model,
          usage: message?.usage,
          costUsd: calcLlmCostUsd(req.params?.model, message?.usage),
          stopReason: message?.stop_reason ?? null,
        });
        parsed.set(req.custom_id, { ok: true, message });
      } else {
        parsed.set(req.custom_id, {
          ok: false,
          error: item.result?.error?.message ?? item.result?.type ?? 'batch_error',
        });
      }
    }
    return parsed;
  }

  return { submitBatch, pollUntilComplete, collectResults, runBatch };
}

let sharedBatchAdapter = null;

export function getDefaultBatchAdapter() {
  if (!sharedBatchAdapter) sharedBatchAdapter = createAnthropicBatchAdapter();
  return sharedBatchAdapter;
}
