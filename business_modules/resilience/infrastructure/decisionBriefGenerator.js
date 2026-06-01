/**
 * Single-shot LLM generation for operator decision brief JSON.
 */
import Anthropic from '@anthropic-ai/sdk';
import { extractJson } from './claudeJsonHelpers.js';
import {
  buildDecisionBriefSystemPrompt,
  buildDecisionBriefUserPrompt,
  buildDecisionBriefPayload,
} from '../domain/services/decisionBriefPrompt.js';

const defaultClient = new Anthropic();

const SCORE_IN_TEXT_RE = /\b([1-9]|10)\s*\/\s*10\b|\bscore\s*[:=]\s*[1-9]\d?\b/i;

export function decisionBriefEnabled() {
  return process.env.RESILIENCE_DECISION_BRIEF_ENABLED !== '0';
}

export function decisionBriefModel() {
  return process.env.RESILIENCE_DECISION_BRIEF_MODEL
    ?? process.env.RESILIENCE_VALIDATION_EXPLAIN_MODEL
    ?? 'claude-haiku-4-5-20251001';
}

/**
 * @param {unknown} raw
 * @returns {object|null}
 */
export function normalizeDecisionBriefOutput(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
  const priorityItems = Array.isArray(raw.priority_items)
    ? raw.priority_items
      .filter((p) => p && typeof p === 'object')
      .slice(0, 6)
      .map((p) => ({
        attention_id: p.attention_id ?? null,
        recommendation_id: p.recommendation_id ?? null,
        level: ['critical', 'warning', 'watch', 'info'].includes(p.level) ? p.level : 'watch',
        rationale: String(p.rationale ?? '').slice(0, 800),
        suggested_next_step: String(p.suggested_next_step ?? '').slice(0, 400),
      }))
    : [];
  if (!summary && priorityItems.length === 0) return null;
  return { summary, priority_items: priorityItems };
}

/**
 * Reject operator brief text that leaks numeric scores.
 * @param {object} brief
 */
export function assertOperatorSafeBrief(brief) {
  const blob = JSON.stringify(brief);
  if (SCORE_IN_TEXT_RE.test(blob)) {
    throw new Error('Decision brief contains forbidden score notation');
  }
}

/**
 * @param {object} assessment
 * @param {{ reportScopeId?: string, client?: object, onUsage?: Function }} opts
 * @returns {Promise<object|null>}
 */
export async function generateDecisionBrief(assessment, opts = {}) {
  if (!decisionBriefEnabled()) return null;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!assessment || typeof assessment !== 'object') return null;

  const reportScopeId = opts.reportScopeId
    ?? assessment.report_scope?.id
    ?? 'national';
  const payload = buildDecisionBriefPayload(assessment, reportScopeId);
  const model = decisionBriefModel();
  const client = opts.client ?? defaultClient;

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    temperature: 0,
    system: buildDecisionBriefSystemPrompt(),
    messages: [{
      role: 'user',
      content: buildDecisionBriefUserPrompt(payload),
    }],
  });

  if (opts.onUsage && response.usage) {
    opts.onUsage({ label: 'decision-brief', model, usage: response.usage });
  }

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const parsed = normalizeDecisionBriefOutput(extractJson(text));
  if (!parsed) return null;

  assertOperatorSafeBrief(parsed);

  return {
    ...parsed,
    generated_at: new Date().toISOString(),
    model,
    source: 'agent_batch',
  };
}
