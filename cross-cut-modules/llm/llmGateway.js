/**
 * LLM gateway — wraps LlmPort with telemetry and optional onUsage forwarding.
 */
import { mergeLlmCallContext } from './llmCallContext.js';
import { logLlmInvocation } from './llmInvocationLog.js';
import { calcLlmCostUsd } from './llmPricing.js';

/**
 * @param {import('./ILlmPort.js').LlmPort} innerPort
 * @param {{ defaultCallContext?: Partial<import('./llmCallContext.js').LlmCallContext> }} [cfg]
 * @returns {import('./ILlmPort.js').LlmPort}
 */
export function createLlmGateway(innerPort, cfg = {}) {
  const defaultCtx = cfg.defaultCallContext ?? {};

  function resolveContext(partial) {
    return mergeLlmCallContext(defaultCtx, partial ?? {});
  }

  function emitUsage(onUsage, payload) {
    if (typeof onUsage === 'function') onUsage(payload);
  }

  async function createMessage(opts) {
    const callContext = resolveContext(opts?.callContext);
    const started = Date.now();
    const response = await innerPort.createMessage(opts);
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
    const streamObj = await innerPort.stream(opts);
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
    const onUsage = opts?.onUsage;

    return innerPort.runToolLoop({
      ...opts,
      callContext: baseContext,
      onUsage: onUsage
        ? (p) => {
            logLlmInvocation({
              callContext: mergeLlmCallContext(baseContext, {
                agentName: opts?.agentKind ?? baseContext.agentName,
                purpose: p.label,
              }),
              model: p.model,
              usage: p.usage,
              stopReason: p.stopReason ?? null,
              label: p.label,
            });
            onUsage({
              ...p,
              feature: baseContext.feature,
              costUsd: calcLlmCostUsd(p.model, p.usage),
            });
          }
        : undefined,
    });
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
