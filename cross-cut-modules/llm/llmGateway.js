/**
 * LLM gateway — wraps LlmPort with telemetry and optional onUsage forwarding.
 */
import { mergeLlmCallContext } from './llmCallContext.js';
import { logLlmInvocation } from './llmInvocationLog.js';
import { calcLlmCostUsd } from './llmPricing.js';

function emitUsage(onUsage, payload) {
  if (typeof onUsage === 'function') onUsage(payload);
}

/**
 * @param {import('./ILlmPort.js').LlmPort} innerPort
 * @param {{ defaultCallContext?: Partial<import('./llmCallContext.js').LlmCallContext> }} [cfg]
 * @returns {import('./ILlmPort.js').LlmPort}
 */
export function createLlmGateway(innerPort, cfg = {}) {
  const defaultCtx = cfg.defaultCallContext ?? {};
  const breakerThreshold = Number.parseInt(process.env.LLM_BREAKER_THRESHOLD ?? '5', 10);
  const breakerCooldownMs = Number.parseInt(process.env.LLM_BREAKER_COOLDOWN_MS ?? '60000', 10);
  const consecutiveFailureLimit = Number.isFinite(breakerThreshold) && breakerThreshold > 0 ? breakerThreshold : 5;
  const cooldownMs = Number.isFinite(breakerCooldownMs) && breakerCooldownMs > 0 ? breakerCooldownMs : 60_000;

  let consecutiveProviderFailures = 0;
  let breakerOpenUntilMs = 0;

  function isBreakerOpen() {
    return Date.now() < breakerOpenUntilMs;
  }

  function makeCircuitOpenError() {
    const err = new Error('LLM circuit breaker open');
    err.name = 'LlmCircuitOpenError';
    err.code = 'llm_circuit_open';
    err.providerCircuitOpen = true;
    return err;
  }

  function isNetworkOrProviderFailure(err) {
    if (!err || typeof err !== 'object') return false;
    const status = err.status ?? err.statusCode ?? err?.response?.status;
    if (status === 429) return true;
    if (Number.isFinite(status) && status >= 500 && status <= 599) return true;

    const code = err.code ?? err?.cause?.code ?? '';
    const msg = String(err.message ?? '');
    if (['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ENOTFOUND'].includes(code)) return true;
    if (/rate.?limit|429/i.test(msg)) return true;
    if (/timeout|timed out|unavailable|temporarily/i.test(msg)) return true;

    return false;
  }

  function logCircuitOpen(callContext, model) {
    try {
      logLlmInvocation({
        callContext,
        model: model ?? 'unknown',
        usage: null,
        latencyMs: 0,
        stopReason: 'llm_circuit_open',
        label: callContext.purpose ?? callContext.feature,
      });
    } catch {
      // never let observability failures break request handling
    }
  }

  function resolveContext(partial) {
    return mergeLlmCallContext(defaultCtx, partial ?? {});
  }

  async function guardedProviderCall(callContext, model, fn) {
    if (isBreakerOpen()) {
      logCircuitOpen(callContext, model);
      throw makeCircuitOpenError();
    }
    try {
      const res = await fn();
      consecutiveProviderFailures = 0;
      return res;
    } catch (err) {
      if (isNetworkOrProviderFailure(err)) {
        consecutiveProviderFailures += 1;
        if (consecutiveProviderFailures >= consecutiveFailureLimit) {
          breakerOpenUntilMs = Date.now() + cooldownMs;
        }
      }
      throw err;
    }
  }

  async function createMessage(opts) {
    const callContext = resolveContext(opts?.callContext);
    const started = Date.now();
    const response = await guardedProviderCall(callContext, opts?.model, () => innerPort.createMessage(opts));
    const latencyMs = Date.now() - started;

    logLlmInvocation({
      callContext,
      model: opts?.model,
      usage: response?.usage,
      latencyMs,
      stopReason: response?.stop_reason ?? null,
      label: callContext.purpose,
    });

    if (opts?.onUsage && response?.usage) {
      emitUsage(opts.onUsage, {
        label: callContext.purpose ?? callContext.feature,
        model: opts.model,
        usage: response.usage,
        costUsd: calcLlmCostUsd(opts.model, response.usage),
        feature: callContext.feature,
      });
    }

    return response;
  }

  async function stream(opts) {
    const callContext = resolveContext(opts?.callContext);
    const started = Date.now();
    const streamObj = await guardedProviderCall(callContext, opts?.model, () => innerPort.stream(opts));
    const wrapped = streamObj;

    if (typeof streamObj.finalMessage === 'function') {
      const origFinal = streamObj.finalMessage.bind(streamObj);
      wrapped.finalMessage = async () => {
        const message = await origFinal();
        const latencyMs = Date.now() - started;
        logLlmInvocation({
          callContext,
          model: opts?.model,
          usage: message?.usage,
          latencyMs,
          stopReason: message?.stop_reason ?? null,
          label: callContext.purpose,
        });
        if (opts?.onUsage && message?.usage) {
          emitUsage(opts.onUsage, {
            label: callContext.purpose ?? callContext.feature,
            model: opts.model,
            usage: message.usage,
            costUsd: calcLlmCostUsd(opts.model, message.usage),
            feature: callContext.feature,
          });
        }
        return message;
      };
    }

    return wrapped;
  }

  async function runToolLoop(opts) {
    const baseContext = resolveContext(opts?.callContext);
    const userOnUsage = opts?.onUsage;

    return guardedProviderCall(baseContext, opts?.model, () => innerPort.runToolLoop({
      ...opts,
      callContext: baseContext,
      onUsage: (p) => {
        logLlmInvocation({
          callContext: mergeLlmCallContext(baseContext, {
            agentName: opts?.agentKind ?? baseContext.agentName,
            purpose: p.label,
            promptCacheApplied: p.promptCacheApplied === true ? true : undefined,
          }),
          model: p.model,
          usage: p.usage,
          stopReason: p.stopReason ?? null,
          label: p.label,
        });
        if (userOnUsage) {
          userOnUsage({
            ...p,
            feature: baseContext.feature,
            costUsd: calcLlmCostUsd(p.model, p.usage),
          });
        }
      },
    }));
  }

  return {
    createMessage,
    stream,
    runToolLoop,
    defaultModel: innerPort.defaultModel,
  };
}

/**
 * Log a cache hit (no LLM call) for extraction telemetry.
 * @param {Partial<import('./llmCallContext.js').LlmCallContext>} callContext
 */
export function logLlmCacheHit(callContext) {
  logLlmInvocation({
    callContext: mergeLlmCallContext({}, { ...callContext, cacheHit: callContext.cacheHit ?? 'extraction' }),
    model: 'cache',
    usage: { input_tokens: 0, output_tokens: 0 },
    costUsd: 0,
    latencyMs: 0,
    stopReason: 'cache_hit',
  });
}
