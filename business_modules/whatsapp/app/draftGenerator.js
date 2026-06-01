/**
 * One-shot Hebrew prose draft generator.
 *
 * Takes the accumulated structured state + the officer's turn history and
 * produces a 2–4 sentence Hebrew field report separating observation, spread,
 * source basis, and interpretation cues. The officer reviews this before submit.
 *
 * Strict contract: the model must not add facts, names, or interpretations
 * beyond what's in the input. It may only phrase.
 */

import { createAnthropicLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { buildDraftUserContent } from '../../report_build/domain/reportBuildPrompt.js';

const SYSTEM_PROMPT =
  `You are an Israeli community resilience field-report drafter.\n` +
  `Given a structured summary and the raw dialogue, produce a concise Hebrew\n` +
  `field report — 2 to 4 sentences — that a Population Behavior Officer can submit.\n\n` +
  `STRICT RULES:\n` +
  `1. Do NOT introduce facts, names, localities, numbers, quotes, or interpretations\n` +
  `   not present in the input. If something is missing, do NOT invent it.\n` +
  `2. Do NOT score components or declare resilience levels.\n` +
  `3. Keep the four layers visible in the prose, in this order:\n` +
  `   (a) Observation — what was observed (behavior, locality, affected population).\n` +
  `   (b) Spread — isolated / noticeable / widespread (use Hebrew equivalents).\n` +
  `   (c) Source basis — direct observation / staff / residents / mixed.\n` +
  `   (d) Interpretation cue — possible drivers, leaving alternatives open.\n` +
  `4. Use neutral, professional Hebrew. No emojis, no headings, no bullet points.\n` +
  `5. Return ONLY the Hebrew prose. No JSON, no prefatory text, no markdown.\n` +
  `6. If a field is null/missing, either omit that sentence or use a neutral hedge\n` +
  `   ("היקף מדויק טרם דווח"). Never fabricate.\n`;

/**
 * @param {{ anthropicApiKey: string }} deps
 */
export function createDraftGenerator({ anthropicApiKey }) {
  const llmPort = createAnthropicLlmPort({ apiKey: anthropicApiKey });

  return {
    /**
     * @param {object} structuredState  The merged observation/interpretation/componentLinks/confidence object.
     * @param {Array<{role, text}>} turnHistory  Raw officer↔bot turns.
     * @returns {Promise<string>} Hebrew prose draft.
     */
    async generate(structuredState, turnHistory, ragContext = null) {
      const userContent = buildDraftUserContent(structuredState, turnHistory, ragContext);
      const response = await llmPort.createMessage({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });
      const textBlock = response.content.find((b) => b.type === 'text');
      const text = textBlock ? textBlock.text.trim() : '';
      return text;
    },
  };
}
