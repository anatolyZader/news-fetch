/**
 * Per-run USD and round budget with degrade mode when threshold exceeded.
 */
import { calcInvocationCostUsd } from '../budget/app/budgetCostTracker.js';

/**
 * @param {{ maxUsd?: number, maxToolRounds?: number }} [opts]
 */
export function createAgentBudgetGovernor(opts = {}) {
  const maxUsd = opts.maxUsd ?? 2.5;
  const maxToolRounds = opts.maxToolRounds ?? 24;
  let spentUsd = 0;
  let toolRounds = 0;
  let degradeMode = null;

  return {
    get maxUsd() { return maxUsd; },
    get maxToolRounds() { return maxToolRounds; },
    get spentUsd() { return spentUsd; },
    get toolRounds() { return toolRounds; },
    get degradeMode() { return degradeMode; },

    recordUsage({ model, usage }) {
      if (usage) {
        spentUsd += calcInvocationCostUsd(model ?? '', usage);
      }
      toolRounds += 1;
      if (spentUsd >= maxUsd * 0.8 && !degradeMode) {
        degradeMode = 'focus_top_3_components';
      }
      return { spentUsd, toolRounds, degradeMode };
    },

    // toolRounds is tracked for telemetry/snapshot only; the cross-agent gate
    // is USD. Per-agent round limits live in each kernel's runToolLoop maxRounds.
    canContinue() {
      return spentUsd < maxUsd;
    },

    snapshot() {
      return {
        max_usd: maxUsd,
        max_tool_rounds: maxToolRounds,
        spent_usd: Math.round(spentUsd * 1e6) / 1e6,
        tool_rounds: toolRounds,
        degrade_mode: degradeMode,
      };
    },
  };
}
