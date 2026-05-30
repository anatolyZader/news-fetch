/**
 * LLM draft generator for catalog signal-type proposals (never writes signalCatalog.js).
 */
import Anthropic from '@anthropic-ai/sdk';
import { catalogProposalLlmEnabled } from '../../../../cross-cut-modules/retrieval/ragConfig.js';
import { extractJson } from '../../../resilience/infrastructure/claudeJsonHelpers.js';

const client = new Anthropic();
const MODEL = 'claude-haiku-4-5-20251001';

/**
 * @param {object} cluster
 * @param {object} [opts]
 */
export async function generateCatalogProposalFields(cluster, opts = {}) {
  if (!catalogProposalLlmEnabled()) {
    return {
      suggested_signal_type: String(cluster.key ?? '').slice(0, 80),
      suggested_label: '',
      suggested_definition: '',
      merge_vs_new_recommendation: 'review',
      rationale: 'LLM draft generation disabled (CATALOG_PROPOSAL_LLM_ENABLED=0).',
    };
  }

  const anthropic = opts.client ?? client;
  const samples = (cluster.sample_evidence ?? []).slice(0, 3).join('\n---\n');
  const nearest = (cluster.nearest_catalog ?? [])
    .slice(0, 3)
    .map((e) => `${e.type}: ${e.label ?? ''}`)
    .join('\n');

  const userContent =
    `Cluster key: ${cluster.key}\n` +
    `Count: ${cluster.count}\n` +
    `Related types: ${(cluster.related_types ?? []).join(', ')}\n` +
    `Sample evidence:\n${samples}\n\n` +
    `Nearest catalog:\n${nearest || '(none)'}\n\n` +
    'Return JSON only with keys: suggested_signal_type, suggested_label, suggested_definition, ' +
    'merge_vs_new_recommendation (merge|new|review), rationale.';

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    temperature: 0,
    system:
      'You help analysts draft new signal catalog entries for Israeli community resilience monitoring. ' +
      'Never invent evidence. Propose snake_case signal types matching existing catalog style.',
    messages: [{ role: 'user', content: userContent }],
  });

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try {
    const parsed = extractJson(text);
    return {
      suggested_signal_type: String(parsed.suggested_signal_type ?? cluster.key ?? '').slice(0, 120),
      suggested_label: String(parsed.suggested_label ?? '').slice(0, 200),
      suggested_definition: String(parsed.suggested_definition ?? '').slice(0, 800),
      merge_vs_new_recommendation: String(parsed.merge_vs_new_recommendation ?? 'review').slice(0, 20),
      rationale: String(parsed.rationale ?? '').slice(0, 600),
    };
  } catch {
    return {
      suggested_signal_type: String(cluster.key ?? '').slice(0, 80),
      suggested_label: '',
      suggested_definition: '',
      merge_vs_new_recommendation: 'review',
      rationale: 'LLM response could not be parsed as JSON.',
    };
  }
}
