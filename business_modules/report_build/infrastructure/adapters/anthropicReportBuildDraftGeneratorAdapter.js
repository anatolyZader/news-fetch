import { createAnthropicLlmPort } from '../../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { HAIKU_MODEL } from '../../../../cross-cut-modules/llm/modelIds.js';
import { createLlmGateway } from '../../../../cross-cut-modules/llm/llmGateway.js';
import { buildDraftUserContent } from '../../domain/reportBuildPrompt.js';

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
export function createAnthropicReportBuildDraftGeneratorAdapter({ anthropicApiKey }) {
  const port = createLlmGateway(createAnthropicLlmPort({ apiKey: anthropicApiKey }));

  return {
    async generate(structuredState, turnHistory, ragContext = null, opts = {}) {
      const model = HAIKU_MODEL;
      const userContent = buildDraftUserContent(structuredState, turnHistory, ragContext);
      const response = await port.createMessage({
        model,
        max_tokens: 800,
        temperature: 0.2,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
        callContext: { feature: 'report_build', purpose: 'report-build:draft' },
      });
      if (opts.onUsage && response.usage) {
        opts.onUsage({ label: 'report-build:draft', model, usage: response.usage });
      }
      const textBlock = response.content.find((b) => b.type === 'text');
      return textBlock ? textBlock.text.trim() : '';
    },
  };
}

