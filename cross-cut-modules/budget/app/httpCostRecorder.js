/**
 * Per-request HTTP LLM cost accumulator — flushes to cost-log.jsonl for daily budget.
 */
import { appendCostLog } from '../../log/index.js';
import { calcInvocationCostUsd } from './budgetCostTracker.js';
import { redactSecrets } from '../../security/domain/services/secretRedaction.js';

/**
 * @param {{
 *   script: string,
 *   ownerUid?: string,
 *   route?: string,
 *   date?: string,
 * }} opts
 */
export function createHttpCostRecorder(opts) {
  const script = String(opts?.script ?? 'http:unknown').trim() || 'http:unknown';
  const date = opts?.date ?? new Date().toISOString().slice(0, 10);
  const meta = {
    ownerUid: opts?.ownerUid ?? null,
    route: opts?.route ?? null,
  };

  const usageLog = [];
  const stageEvents = [];
  let totalCostUsd = 0;

  /**
   * @param {{
   *   label: string,
   *   model?: string,
   *   usage?: { input_tokens?: number, output_tokens?: number },
   *   costUsd?: number,
   *   stage?: string,
   *   stats?: Record<string, unknown>,
   * }} payload
   */
  function onUsage(payload) {
    const { label, model, usage, costUsd, stage, stats } = payload ?? {};

    if (stage) {
      stageEvents.push({ label: label ?? script, stage, stats: redactSecrets(stats ?? {}) });
      console.error(`  🔎 ${String(label ?? script).padEnd(38)} stage=${stage}`);
      return;
    }

    let cost;
    if (typeof costUsd === 'number' && Number.isFinite(costUsd)) {
      cost = Math.max(0, costUsd);
    } else if (usage && model) {
      cost = calcInvocationCostUsd(model, usage);
    } else {
      return;
    }
    totalCostUsd += cost;
    usageLog.push({
      label: label ?? 'call',
      model: model ?? 'unknown',
      usage: usage ?? { input_tokens: 0, output_tokens: 0 },
      cost,
    });
  }

  function getTotal() {
    return { totalCostUsd, usageLog, stageEvents };
  }

  function flush() {
    if (totalCostUsd <= 0 && stageEvents.length === 0) {
      return { flushed: false, totalCostUsd: 0 };
    }
    appendCostLog({
      script,
      date,
      totalCostUsd,
      usageLog,
      ...(stageEvents.length ? { stageEvents } : {}),
      ...(meta.ownerUid ? { owner_uid: meta.ownerUid } : {}),
      ...(meta.route ? { route: meta.route } : {}),
    });
    return { flushed: true, totalCostUsd };
  }

  return { onUsage, getTotal, flush, script, date };
}
