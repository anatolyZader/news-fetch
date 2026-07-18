/**
 * Haiku open-vocabulary observation extraction.
 */
import { jsonrepair } from 'jsonrepair';
import { resolveLlmPort } from '../../../../cross-cut-modules/llm/resolveLlmPort.js';
import { HAIKU_MODEL } from '../../../../cross-cut-modules/llm/modelIds.js';
import { IOpenExtractionPort } from '../../domain/ports/IOpenExtractionPort.js';
import {
  buildOpenExtractionPrompt,
  buildResidualExtractionPrompt,
} from '../../domain/services/openExtractionPrompts.js';
import { normalizeObservations } from '../../domain/services/observationSchema.js';

const DEFAULT_MODEL = process.env.SIGNALS_EXTRACTION_MODEL
  ?? process.env.GENERIC_EXTRACTION_MODEL
  ?? process.env.RESILIENCE_EXTRACT_MODEL
  ?? HAIKU_MODEL;

const BATCH_SIZE = 8;

/**
 * @param {string} text
 */
function extractJsonArray(text) {
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error('No JSON array in response');
  const raw = text.slice(arrStart, arrEnd + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
}

export class AnthropicOpenExtractionAdapter extends IOpenExtractionPort {
  /**
   * @param {{ client?: Anthropic, model?: string }} [opts]
   */
  constructor(opts = {}) {
    super();
    this.llmPort = resolveLlmPort(opts);
    this.model = opts.model ?? DEFAULT_MODEL;
  }

  /**
   * @param {Array<object>} articles
   * @param {{ profile?: string, onUsage?: Function, batchLabel?: string }} opts
   */
  async extractObservations(articles, opts = {}) {
    const profile = opts.profile ?? 'exploratory';
    const batchLabel = opts.batchLabel ?? 'open-extract';
    const all = [];

    for (let start = 0; start < articles.length; start += BATCH_SIZE) {
      const batch = articles.slice(start, start + BATCH_SIZE);
      const label = `${batchLabel} ${start + 1}-${start + batch.length}/${articles.length}`;
      const batchObs = await this._extractBatch(batch, { profile, onUsage: opts.onUsage, batchLabel: label });
      all.push(...batchObs);
    }

    return all;
  }

  /**
   * @param {Array<object>} articles
   * @param {{ profile: string, onUsage?: Function, batchLabel: string }} opts
   */
  async _extractBatch(articles, opts) {
    const { profile, onUsage, batchLabel } = opts;
    const { system, user } = profile === 'residual'
      ? buildResidualExtractionPrompt(articles)
      : buildOpenExtractionPrompt(articles, profile);

    const response = await this.llmPort.createMessage({
      model: this.model,
      max_tokens: Math.min(8000, 600 + articles.length * 200),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
      callContext: { feature: 'open_extraction', purpose: batchLabel },
    });

    if (onUsage) {
      onUsage({ label: batchLabel, model: this.model, usage: response.usage });
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock?.text) return [];

    const parsed = extractJsonArray(textBlock.text);
    const normalized = normalizeObservations(parsed);

    for (const obs of normalized) {
      const idx = obs.article_index - 1;
      if (idx >= 0 && idx < articles.length) {
        const art = articles[idx];
        obs.article_url = obs.article_url ?? art.url ?? art.article_url ?? null;
        obs.article_source = obs.article_source ?? art.source ?? null;
      }
    }

    return normalized;
  }
}
