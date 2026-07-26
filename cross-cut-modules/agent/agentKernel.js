/**
 * Unified agent kernel: tool loop + budget + trace + schema validation.
 */
import { createHash } from 'node:crypto';
import { createAgentBudgetGovernor } from './agentBudgetGovernor.js';
import { createWorkingMemory } from './memory/workingMemory.js';
import { createTraceStore, hashInputs } from './memory/traceStore.js';
import {
  validateSubmitToolPayload,
  parseToolInput,
  validateToolInputAgainstInputSchema,
} from './schemaValidator.js';
import { getToolsForProfile } from './toolRegistry.js';
import { compactToolLoopEnabled, chatCompactToolLoopEnabled } from './agentConfig.js';

function resolveCompactHistory(profile, explicit) {
  if (explicit !== undefined) return explicit;
  if (profile === 'chat') return chatCompactToolLoopEnabled();
  return compactToolLoopEnabled();
}
import './profiles/chat.profile.js';
import './profiles/validation.profile.js';
import './profiles/assessment.profile.js';
import './profiles/analyst.profile.js';

function generateRunId() {
  return createHash('sha256')
    .update(`${Date.now()}-${Math.random()}`)
    .digest('hex')
    .slice(0, 12);
}

function systemHashInput(system) {
  if (system == null) return '';
  if (typeof system === 'string') return system.slice(0, 500);
  if (typeof system === 'object' && system.stable != null) {
    return `${String(system.stable).slice(0, 400)}${String(system.dynamic ?? '').slice(0, 100)}`;
  }
  return JSON.stringify(system).slice(0, 500);
}

/**
 * @param {{ llmPort: import('../llm/ILlmPort.js').LlmPort, traceStore?: ReturnType<typeof createTraceStore> }} deps
 */
export function createAgentKernel(deps) {
  const llmPort = deps.llmPort;
  const traceStore = deps.traceStore ?? createTraceStore();

  /**
   * @param {{
   *   profile: string,
   *   agentKind?: string,
   *   model: string,
   *   system: string,
   *   messages: Array<object>,
   *   tools?: Array<object>,
   *   extraTools?: Array<object>,
   *   maxRounds?: number,
   *   maxTokens?: number,
   *   temperature?: number,
   *   executeTool: (name: string, input: object, toolUseBlock?: object) => Promise<string>|string,
   *   onTextBlock?: (text: string) => void,
   *   onTextDelta?: (text: string) => void,
   *   onUsage?: (payload: object) => void,
   *   budget?: ReturnType<typeof createAgentBudgetGovernor>,
   *   runId?: string,
   *   traceId?: string,
   *   inputsForHash?: unknown,
   *   abortSignal?: AbortSignal|null,
   * }} opts
   */
  async function run(opts) {
    const runId = opts.runId ?? generateRunId();
    const traceId = opts.traceId ?? runId;
    const memory = createWorkingMemory(runId);
    const budget = opts.budget ?? createAgentBudgetGovernor();
    const tools = opts.tools ?? getToolsForProfile(opts.profile, opts.extraTools ?? []);
    const agentKind = opts.agentKind ?? opts.profile;

    traceStore.append(traceId, {
      agent: agentKind,
      event: 'run_start',
      profile: opts.profile,
      inputs_hash: hashInputs(opts.inputsForHash ?? systemHashInput(opts.system)),
    });

    const submitPayloads = [];

    const loopResult = await llmPort.runToolLoop({
      model: opts.model,
      maxTokens: opts.maxTokens ?? 4000,
      maxRounds: opts.maxRounds ?? 5,
      temperature: opts.temperature ?? 0,
      system: opts.system,
      messages: opts.messages ?? [],
      tools,
      agentKind,
      abortSignal: opts.abortSignal ?? null,
      retryModelCall: opts.retryModelCall ?? null,
      parallelToolCalls: opts.parallelToolCalls === true,
      compactHistoryAfterRound: resolveCompactHistory(opts.profile, opts.compactHistoryAfterRound),
      workingMemory: memory,
      budget,
      callContext: {
        feature: agentKind,
        agentName: agentKind,
        purpose: `${agentKind}:tool_loop`,
      },
      onTextBlock: opts.onTextBlock,
      onTextDelta: opts.onTextDelta,
      onToolStart: opts.onToolStart,
      onUsage: (p) => {
        budget.recordUsage({ model: p.model, usage: p.usage });
        if (opts.onUsage) opts.onUsage(p);
      },
      onToolRound: (meta) => {
        traceStore.append(traceId, {
          agent: agentKind,
          event: 'tool_round',
          round: meta.round,
          tools: meta.tools,
          usage: meta.usage,
          budget: budget.snapshot(),
        });
      },
      executeTool: async (name, input, toolUseBlock) => {
        const isSubmit = String(name).startsWith('submit_');
        // Submits are always allowed through: tokens are already spent, discarding
        // the result gains nothing and breaks the entire run via fallback templates.
        if (!isSubmit && !budget.canContinue()) {
          return JSON.stringify({ error: 'budget_exceeded', budget: budget.snapshot() });
        }

        const parsed = parseToolInput(input);

        // Universal tool input validation based on the tool's declared input_schema.
        // This hardens tool-call boundaries against malformed or out-of-contract arguments.
        const toolDef = tools.find((t) => t?.name === name);
        const inputSchema = toolDef?.input_schema ?? null;
        if (inputSchema) {
          const validation = validateToolInputAgainstInputSchema(parsed, inputSchema);
          if (!validation.valid) {
            return JSON.stringify({ error: 'validation_failed', tool: name, errors: validation.errors });
          }
        }

        if (isSubmit) {
          const validation = validateSubmitToolPayload(name, parsed);
          if (!validation.valid) {
            return JSON.stringify({ error: 'validation_failed', errors: validation.errors });
          }
          submitPayloads.push({ tool: name, payload: parsed });
          memory.set(`submit:${name}`, parsed);
        }

        const result = await opts.executeTool(name, parsed ?? input ?? {}, toolUseBlock);
        memory.set(`tool:${name}:${budget.toolRounds}`, result);
        return result;
      },
    });

    traceStore.append(traceId, {
      agent: agentKind,
      event: 'run_end',
      stop_reason: loopResult.stopReason,
      budget: budget.snapshot(),
      submit_count: submitPayloads.length,
    });

    memory.dispose();

    return {
      ...loopResult,
      runId,
      traceId,
      budget: budget.snapshot(),
      submitPayloads,
    };
  }

  return { run, traceStore };
}

export { createTraceStore } from './memory/traceStore.js';
export { createAgentBudgetGovernor } from './agentBudgetGovernor.js';
export { createWorkingMemory } from './memory/workingMemory.js';
