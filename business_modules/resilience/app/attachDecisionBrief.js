/**
 * Attach batch decision brief to assessment after scoring + pattern detection.
 */
import {
  decisionBriefEnabled,
  generateDecisionBrief,
} from '../infrastructure/decisionBriefGenerator.js';

/**
 * @param {object} assessment — mutated in place when brief is generated
 * @param {{
 *   reportScopeId?: string,
 *   client?: object,
 *   onUsage?: (payload: { label: string, model: string, usage: object }) => void,
 * }} [opts]
 * @returns {Promise<object|null>} brief or null
 */
export async function attachDecisionBrief(assessment, opts = {}) {
  if (!decisionBriefEnabled()) return null;
  if (!assessment || typeof assessment !== 'object') return null;

  try {
    const brief = await generateDecisionBrief(assessment, {
      reportScopeId: opts.reportScopeId,
      client: opts.client,
      onUsage: opts.onUsage,
    });
    if (brief) {
      assessment.decision_brief = brief;
      return brief;
    }
  } catch (err) {
    console.error(`  ⚠ Decision brief generation failed: ${err.message}`);
  }
  return null;
}



export {decisionBriefEnabled} from '../infrastructure/decisionBriefGenerator.js';