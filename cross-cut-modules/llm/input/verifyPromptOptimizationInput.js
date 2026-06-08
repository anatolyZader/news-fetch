/**
 * Post-deploy prompt optimization verification CLI logic.
 */
import 'dotenv/config';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createAnthropicLlmPort } from '../anthropicLlmAdapter.js';
import { createLlmGateway } from '../llmGateway.js';
import { readJsonlRecords } from '../../log/infrastructure/jsonlLog.js';
import { resolveLlmInvocationsPath } from '../llmInvocationLog.js';
import { calcLlmCostUsd } from '../llmPricing.js';
import {
  analyzeLlmInvocations,
  analyzeLlmInvocationsForDate,
  formatAnalysisReport,
} from '../analyzeLlmInvocations.js';
import { formatPromptOptimizationFlags } from '../promptOptimizationFlags.js';
import { generateDecisionBrief } from '../../../business_modules/resilience/infrastructure/decisionBriefGenerator.js';

const LIVE_COST_WARN_USD = 0.05;
const STABLE_SYSTEM = 'x'.repeat(2500);

/**
 * Mock client: round-0 tool_use + cache creation; round-1 end_turn + cache read.
 */
export function createOfflineMockClient() {
  let callIndex = 0;
  return {
    messages: {
      create: async () => {
        if (callIndex === 0) {
          callIndex += 1;
          return {
            stop_reason: 'tool_use',
            content: [
              { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'test' } },
            ],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_creation_input_tokens: 2000,
            },
          };
        }
        callIndex += 1;
        return {
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Done.' }],
          usage: {
            input_tokens: 150,
            output_tokens: 10,
            cache_read_input_tokens: 2000,
          },
        };
      },
    },
  };
}

/**
 * @param {{ logDir?: string, invocationsPath?: string }} [opts]
 * @returns {Promise<{ ok: boolean, report: object, rows: object[] }>}
 */
export async function runOfflineSmoke(opts = {}) {
  const dir = opts.logDir ?? mkdtempSync(join(tmpdir(), 'prompt-opt-verify-'));
  const invPath = opts.invocationsPath ?? join(dir, 'invocations.jsonl');
  const prevPath = process.env.LLM_INVOCATIONS_PATH;
  const prevCache = process.env.LLM_PROMPT_CACHE;
  const prevChatCache = process.env.CHAT_PROMPT_CACHE;

  process.env.LLM_INVOCATIONS_PATH = invPath;
  process.env.LLM_PROMPT_CACHE = '1';
  process.env.CHAT_PROMPT_CACHE = '1';

  try {
    const port = createLlmGateway(createAnthropicLlmPort({ client: createOfflineMockClient() }));

    await port.runToolLoop({
      model: 'claude-haiku-4-5-20251001',
      system: { stable: STABLE_SYSTEM, dynamic: 'user context for verify' },
      messages: [{ role: 'user', content: 'Run lookup for test.' }],
      tools: [{
        name: 'lookup',
        description: 'Lookup data',
        input_schema: { type: 'object', properties: { q: { type: 'string' } } },
      }],
      agentKind: 'chat',
      maxRounds: 2,
      callContext: { feature: 'chat', purpose: 'verify-offline-smoke' },
      executeTool: async () => '{"result":"ok"}',
      onUsage: () => {},
    });

    const rows = [...readJsonlRecords(invPath)];
    const report = analyzeLlmInvocations(rows);

    const round1 = rows.find((r) => r.purpose === 'chat:round-1');
    const hasCacheApplied = rows.some((r) => r.promptCacheApplied === true);
    const round1CacheRead = round1?.cachedInputTokens ?? 0;

    const ok = report.ok
      && rows.length >= 2
      && round1CacheRead > 0
      && hasCacheApplied;

    if (!ok) {
      const failures = [];
      if (rows.length < 2) failures.push(`expected >= 2 invocations, got ${rows.length}`);
      if (round1CacheRead <= 0) failures.push('chat:round-1 missing cache_read_input_tokens');
      if (!hasCacheApplied) failures.push('no row with promptCacheApplied=true');
      if (!report.ok) failures.push(`analyzer issues: ${report.issues.join('; ')}`);
      report.offline_failures = failures;
    }

    return { ok, report, rows };
  } finally {
    if (prevPath == null) delete process.env.LLM_INVOCATIONS_PATH;
    else process.env.LLM_INVOCATIONS_PATH = prevPath;
    if (prevCache == null) delete process.env.LLM_PROMPT_CACHE;
    else process.env.LLM_PROMPT_CACHE = prevCache;
    if (prevChatCache == null) delete process.env.CHAT_PROMPT_CACHE;
    else process.env.CHAT_PROMPT_CACHE = prevChatCache;
    if (!opts.logDir && !opts.invocationsPath) {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/**
 * @param {{ fullAssess?: boolean }} [opts]
 */
export async function runLiveSmoke(opts = {}) {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('--live requires ANTHROPIC_API_KEY');
  }

  const prevBrief = process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
  process.env.RESILIENCE_DECISION_BRIEF_ENABLED = '1';

  const port = createLlmGateway(createAnthropicLlmPort());
  let totalCost = 0;

  try {
    await port.runToolLoop({
      model: 'claude-haiku-4-5-20251001',
      system: { stable: STABLE_SYSTEM, dynamic: 'Live verify probe.' },
      messages: [{ role: 'user', content: 'Reply with one short sentence only. No tools needed.' }],
      tools: [],
      agentKind: 'chat',
      maxRounds: 0,
      maxTokens: 64,
      callContext: { feature: 'chat', purpose: 'verify-live-smoke' },
      executeTool: async () => 'unused',
      onUsage: (p) => {
        totalCost += calcLlmCostUsd(p.model, p.usage);
      },
    });

    const brief = await generateDecisionBrief({
      date: new Date().toISOString().slice(0, 10),
      components: [{ component_id: 'narrative', confidence: 'low' }],
      assessment_mode: 'field_anchor_only',
    }, {
      reportScopeId: 'north',
      llmPort: port,
      onUsage: (p) => {
        totalCost += calcLlmCostUsd(p.model, p.usage);
      },
    });

    if (opts.fullAssess) {
      console.error('Note: --full-assess is reserved for manual assess-signals runs; not executed in this smoke.');
    }

    const datePrefix = new Date().toISOString().slice(0, 10);
    const report = analyzeLlmInvocationsForDate(datePrefix);

    if (totalCost > LIVE_COST_WARN_USD) {
      report.warnings.push(
        `Live smoke cost $${totalCost.toFixed(4)} exceeds $${LIVE_COST_WARN_USD.toFixed(2)} warning threshold`,
      );
    }

    return { ok: report.ok, report, totalCost, briefGenerated: brief != null };
  } finally {
    if (prevBrief === undefined) delete process.env.RESILIENCE_DECISION_BRIEF_ENABLED;
    else process.env.RESILIENCE_DECISION_BRIEF_ENABLED = prevBrief;
  }
}

/**
 * @param {string[]} argv
 */
export function parseVerifyArgs(argv) {
  const args = argv.slice(2);
  const flags = {
    audit: null,
    showFlags: false,
    live: false,
    fullAssess: false,
    offline: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--flags') flags.showFlags = true;
    else if (a === '--live') flags.live = true;
    else if (a === '--full-assess') flags.fullAssess = true;
    else if (a === '--offline') flags.offline = true;
    else if (a === '--audit') {
      flags.audit = args[i + 1] ?? new Date().toISOString().slice(0, 10);
      i += 1;
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) {
      flags.audit = a;
    }
  }

  if (!flags.showFlags && !flags.live && !flags.audit && !flags.offline) {
    flags.offline = true;
  }

  return flags;
}

/**
 * @param {string[]} [argv]
 */
export async function runVerifyPromptOptimizationCli(argv = process.argv) {
  const flags = parseVerifyArgs(argv);

  if (flags.showFlags) {
    console.log(formatPromptOptimizationFlags());
    return 0;
  }

  if (flags.audit) {
    const report = analyzeLlmInvocationsForDate(flags.audit);
    console.log(formatAnalysisReport(report));
    console.log(`\nLog path: ${resolveLlmInvocationsPath()}`);
    return report.ok ? 0 : 1;
  }

  if (flags.live) {
    const { ok, report, totalCost, briefGenerated } = await runLiveSmoke({
      fullAssess: flags.fullAssess,
    });
    console.log(formatAnalysisReport(report));
    console.log(`\nLive smoke cost: $${totalCost.toFixed(4)}`);
    console.log(`Decision brief: ${briefGenerated ? 'generated' : 'skipped/failed'}`);
    return ok ? 0 : 1;
  }

  const { ok, report } = await runOfflineSmoke();
  console.log(formatAnalysisReport(report));
  if (report.offline_failures?.length) {
    console.error('\nOffline smoke failures:');
    for (const f of report.offline_failures) console.error(`  ✗ ${f}`);
  }
  console.log('\nOffline smoke: ' + (ok ? 'PASS' : 'FAIL'));
  return ok ? 0 : 1;
}
