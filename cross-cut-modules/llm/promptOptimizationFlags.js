/**
 * Report prompt-optimization feature flags and quality escape hatches.
 */
import {
  slimPlannerPromptsEnabled,
  slimSynthPromptsEnabled,
  slimPromptsEnabled,
  compressToolsEnabled,
  compactToolLoopEnabled,
  chatCompactToolLoopEnabled,
} from '../agent/agentConfig.js';
import { chatCompressToolsEnabled } from '../../business_modules/chat/domain/chatConfig.js';
import { chatContextTieringEnabled } from '../../business_modules/chat/domain/chatContextTier.js';
import {
  llmPromptCacheMasterEnabled,
  promptCacheEnabledForFeature,
} from './promptCacheConfig.js';

function flagLine(name, enabled, optOut = '=0') {
  return { name, enabled, opt_out: optOut };
}

/**
 * @returns {{ flags: object[], escape_hatches: object[] }}
 */
export function collectPromptOptimizationFlags() {
  const flags = [
    flagLine('LLM_PROMPT_CACHE', llmPromptCacheMasterEnabled()),
    flagLine('CHAT_PROMPT_CACHE', promptCacheEnabledForFeature('chat')),
    flagLine('RESILIENCE_EXTRACT_PROMPT_CACHE', promptCacheEnabledForFeature('extract')),
    flagLine('RESILIENCE_ASSESS_PROMPT_CACHE', promptCacheEnabledForFeature('assess_planner')),
    flagLine('CHAT_COMPRESS_TOOLS', chatCompressToolsEnabled()),
    flagLine('CHAT_CONTEXT_TIERING', chatContextTieringEnabled()),
    flagLine('CHAT_COMPACT_TOOL_LOOP', chatCompactToolLoopEnabled()),
    flagLine('RESILIENCE_ASSESS_SLIM_PLANNER', slimPlannerPromptsEnabled()),
    flagLine('RESILIENCE_ASSESS_SLIM_SYNTH', slimSynthPromptsEnabled()),
    flagLine('RESILIENCE_ASSESS_SLIM_PROMPTS', slimPromptsEnabled()),
    flagLine('RESILIENCE_ASSESS_COMPRESS_TOOLS', compressToolsEnabled()),
    flagLine('RESILIENCE_ASSESS_COMPACT_TOOL_LOOP', compactToolLoopEnabled()),
  ];

  const escape_hatches = [
    {
      scope: 'chat_one_turn',
      action: 'POST /api/chat body { "economy": "full" }',
      effect: 'Full report context, no compact tool loop, no tool compression for that turn',
    },
    {
      scope: 'chat_compression',
      action: 'CHAT_COMPRESS_TOOLS=0',
      effect: 'Return full tool payloads to the model',
    },
    {
      scope: 'chat_context',
      action: 'CHAT_CONTEXT_TIERING=0',
      effect: 'Full report context every turn',
    },
    {
      scope: 'slim_planner',
      action: 'RESILIENCE_ASSESS_SLIM_PLANNER=0',
      effect: 'Full epistemic profile in planner prompt',
    },
    {
      scope: 'slim_synth',
      action: 'RESILIENCE_ASSESS_SLIM_SYNTH=0',
      effect: 'Full component assessments in synthesizer prompt',
    },
    {
      scope: 'prompt_cache',
      action: 'LLM_PROMPT_CACHE=0',
      effect: 'Disable all Anthropic prompt caching',
    },
  ];

  return { flags, escape_hatches };
}

/**
 * @returns {string}
 */
export function formatPromptOptimizationFlags() {
  const { flags, escape_hatches } = collectPromptOptimizationFlags();
  const lines = ['Prompt optimization flags (default ON unless noted):', ''];
  for (const f of flags) {
    lines.push(`  ${f.name.padEnd(36)} ${f.enabled ? 'ON ' : 'OFF'}  (opt-out: ${f.opt_out})`);
  }
  lines.push('', 'Quality escape hatches:');
  for (const h of escape_hatches) {
    lines.push(`  [${h.scope}] ${h.action}`);
    lines.push(`    → ${h.effect}`);
  }
  return lines.join('\n');
}
