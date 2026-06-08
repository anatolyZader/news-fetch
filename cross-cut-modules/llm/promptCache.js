/**
 * Anthropic ephemeral prompt caching helpers.
 */
import {
  minCacheableChars,
  promptCacheEnabledForFeature,
} from './promptCacheConfig.js';

const EPHEMERAL_CACHE = Object.freeze({ type: 'ephemeral' });

function isSystemBlockArray(system) {
  return Array.isArray(system);
}

function textBlock(text, cache = false) {
  const block = { type: 'text', text: String(text ?? '') };
  if (cache) block.cache_control = EPHEMERAL_CACHE;
  return block;
}

/**
 * @param {string} stableText
 * @param {string} [dynamicText]
 * @param {{ feature?: string }} [opts]
 * @returns {string|Array<object>}
 */
export function buildCachedSystemFromParts(stableText, dynamicText = '', opts = {}) {
  const stable = String(stableText ?? '');
  const dynamic = String(dynamicText ?? '');
  const feature = opts.feature;

  if (!promptCacheEnabledForFeature(feature)) {
    return stable + dynamic;
  }

  const minChars = minCacheableChars();
  if (stable.length < minChars && (stable + dynamic).length < minChars) {
    return stable + dynamic;
  }

  const blocks = [];
  if (stable.length > 0) {
    blocks.push(textBlock(stable, stable.length >= minChars));
  }
  if (dynamic.length > 0) {
    blocks.push(textBlock(dynamic, false));
  }
  if (blocks.length === 0) return '';
  if (blocks.length === 1 && !blocks[0].cache_control) {
    return blocks[0].text;
  }
  return blocks;
}

/**
 * @param {string} systemText
 * @param {{ feature?: string }} [opts]
 * @returns {string|Array<object>}
 */
export function wrapCachedSystemString(systemText, opts = {}) {
  const text = String(systemText ?? '');
  if (!text) return text;
  if (!promptCacheEnabledForFeature(opts.feature)) return text;
  if (text.length < minCacheableChars()) return text;
  return [textBlock(text, true)];
}

/**
 * @param {object} opts
 * @param {{ feature?: string }} [cfg]
 * @returns {object}
 */
export function prepareAnthropicRequest(opts, cfg = {}) {
  if (!opts || typeof opts !== 'object') return opts;
  const feature = cfg.feature
    ?? opts.callContext?.feature
    ?? opts.agentKind
    ?? null;

  if (isSystemBlockArray(opts.system)) {
    return { ...opts, callContext: markCacheContext(opts.callContext, true) };
  }

  if (opts.system == null || opts.system === '') {
    return opts;
  }

  if (typeof opts.system === 'object' && opts.system.stable != null) {
    const system = buildCachedSystemFromParts(
      opts.system.stable,
      opts.system.dynamic ?? '',
      { feature },
    );
    const applied = isSystemBlockArray(system);
    const rest = { ...opts };
    delete rest.system;
    return withOptionalCallContext({ ...rest, system }, opts.callContext, applied);
  }

  if (typeof opts.system === 'string') {
    const system = wrapCachedSystemString(opts.system, { feature });
    const applied = isSystemBlockArray(system);
    return withOptionalCallContext({ ...opts, system }, opts.callContext, applied);
  }

  return opts;
}

/**
 * @param {object} [callContext]
 * @param {boolean} applied
 */
function markCacheContext(callContext, applied) {
  if (!applied) return callContext;
  return { ...callContext, promptCacheApplied: true };
}

function withOptionalCallContext(opts, callContext, applied) {
  const next = markCacheContext(callContext, applied);
  if (next == null && !applied) return opts;
  return { ...opts, callContext: next };
}

export function resolvePromptCacheFeature(opts = {}) {
  return opts.callContext?.feature ?? opts.agentKind ?? null;
}
