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
import { compactToolLoopEnabled, chatCompactToolLoopEnabled, forceSubmitRescueEnabled } from './agentConfig.js';

function resolveCompactHistory(profile, explicit) {
  if (explicit !== undefined) return explicit;
  if (profile === 'chat') return chatCompactToolLoopEnabled();
  return compactToolLoopEnabled();
}
import './profiles/chat.profile.js';
import './profiles/validation.profile.js';
import './profiles/assessment.profile.js';
import './profiles/developer.profile.js';

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
   *   toolChoice?: { type: string, name?: string } | null,
   *   forceSubmitTool?: string | null,
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

    const loopOpts = {
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
      toolChoice: opts.toolChoice ?? null,
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
          return JSON.stringify({
            error: 'budget_exceeded',
            is_error: true,
            category: 'budget',
            retryable: false,
            guidance: 'Budget exhausted — do not call more read tools; finish with the evidence you already have.',
            budget: budget.snapshot(),
          });
        }

        const parsed = parseToolInput(input);

        // Universal tool input validation based on the tool's declared input_schema.
        // This hardens tool-call boundaries against malformed or out-of-contract arguments.
        const toolDef = tools.find((t) => t?.name === name);
        const inputSchema = toolDef?.input_schema ?? null;
        if (inputSchema) {
          const validation = validateToolInputAgainstInputSchema(parsed, inputSchema);
          if (!validation.valid) {
            return JSON.stringify({
              error: 'validation_failed',
              is_error: true,
              category: 'validation',
              retryable: true,
              guidance: 'Fix the listed input errors and call the tool again.',
              tool: name,
              errors: validation.errors,
            });
          }
        }

        if (isSubmit) {
          const validation = validateSubmitToolPayload(name, parsed);
          if (!validation.valid) {
            return JSON.stringify({
              error: 'validation_failed',
              is_error: true,
              category: 'validation',
              retryable: true,
              guidance: 'Fix the listed payload errors and call the submit tool again.',
              tool: name,
              errors: validation.errors,
            });
          }
          submitPayloads.push({ tool: name, payload: parsed });
          memory.set(`submit:${name}`, parsed);
        }

        const result = await opts.executeTool(name, parsed ?? input ?? {}, toolUseBlock);
        memory.set(`tool:${name}:${budget.toolRounds}`, result);
        return result;
      },
    };

    let loopResult = await llmPort.runToolLoop(loopOpts);

    // Forced-submit rescue: when the loop ends without the expected submit_*
    // payload, one extra round with tool_choice pinned to the submit tool is
    // far cheaper (and better grounded) than the deterministic fallback
    // templates downstream. Skipped when the budget is already exhausted.
    const forceSubmitTool = opts.forceSubmitTool ?? null;
    if (
      forceSubmitTool
      && forceSubmitRescueEnabled()
      && !submitPayloads.some((p) => p.tool === forceSubmitTool)
      && budget.canContinue()
    ) {
      const priorMessages = loopResult.messages?.length ? loopResult.messages : (opts.messages ?? []);
      const rescueResult = await llmPort.runToolLoop({
        ...loopOpts,
        messages: [
          ...priorMessages,
          {
            role: 'user',
            content:
              `You have not called ${forceSubmitTool}. Call ${forceSubmitTool} now with your best `
              + 'evidence-backed result based on the work above. Do not call any other tool.',
          },
        ],
        maxRounds: 0,
        toolChoice: { type: 'tool', name: forceSubmitTool },
      });
      loopResult = {
        ...loopResult,
        messages: rescueResult.messages ?? loopResult.messages,
        stopReason: rescueResult.stopReason ?? loopResult.stopReason,
        usage: rescueResult.usage ?? loopResult.usage,
      };
      traceStore.append(traceId, {
        agent: agentKind,
        event: 'submit_rescue',
        tool: forceSubmitTool,
        submitted: submitPayloads.some((p) => p.tool === forceSubmitTool),
      });
    }

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
