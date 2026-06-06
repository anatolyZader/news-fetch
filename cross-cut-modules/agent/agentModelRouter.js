/**
 * Model selection per agent stage with escalation rules.
 */
import { HAIKU_MODEL, SONNET_MODEL } from './agentConfig.js';

/**
 * @param {'planner'|'specialist'|'critic'|'synthesizer'|'critic_repair'|'query_rewrite'} stage
 * @param {{ escalate?: boolean, dataVoid?: boolean, contestedCount?: number }} [ctx]
 */
export function resolveModelForStage(stage, ctx = {}) {
  const escalate = ctx.escalate === true;
  const dataVoid = ctx.dataVoid === true;
  const manyContested = (ctx.contestedCount ?? 0) >= 3;

  if (stage === 'synthesizer') return SONNET_MODEL;
  if (stage === 'specialist' && (escalate || ctx.presenceGate === true || ctx.salienceCritical === true)) {
    return SONNET_MODEL;
  }
  if (stage === 'planner' && (dataVoid || manyContested)) return SONNET_MODEL;
  return HAIKU_MODEL;
}
