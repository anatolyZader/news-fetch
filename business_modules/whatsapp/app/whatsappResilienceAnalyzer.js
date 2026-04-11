/**
 * Real-time resilience signal extraction for individual WhatsApp field reports.
 * Reuses the resilience module's signal extraction prompt with a WhatsApp-specific prefix.
 */

import Anthropic from '@anthropic-ai/sdk';
import { buildSignalExtractionSystemPrompt, extractJsonArray } from '../../resilience/infrastructure/claudeEvaluator.js';
import { SIGNAL_TYPES } from '../../resilience/domain/services/behaviorSignals.js';

const VALID_SIGNAL_TYPES = new Set(SIGNAL_TYPES);
const VALID_EVIDENCE_TYPES = new Set([
  'direct_quote_named_person', 'named_survey_statistic',
  'named_institutional_fact', 'observational_reported_fact',
]);
const INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES = new Set([
  'fear_expression', 'calm_confidence',
]);

/**
 * @param {{ anthropicApiKey: string }} deps
 */
export function createWhatsAppResilienceAnalyzer({ anthropicApiKey }) {
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const systemPrompt = buildSignalExtractionSystemPrompt('whatsapp_realtime');

  return {
    /**
     * Analyze a single WhatsApp message for resilience signals.
     * @param {string} messageText  The message body
     * @param {string} senderName   Sender display name (for logging)
     * @returns {Promise<{ signals: object[], assessment: { sufficient: boolean, missing: string[] } }>}
     */
    async analyzeMessage(messageText, senderName) {
      const userContent =
        `Extract all behavioral signals from this WhatsApp field report:\n\n` +
        `[1] WhatsApp message from ${senderName || 'field worker'}\n` +
        `${messageText}\n`;

      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });

      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock) {
        return { signals: [], assessment: { sufficient: false, missing: ['specific_details'] } };
      }

      const responseText = textBlock.text;

      // Parse the signal array
      let rawSignals;
      try {
        rawSignals = extractJsonArray(responseText);
      } catch {
        return { signals: [], assessment: { sufficient: false, missing: ['specific_details'] } };
      }

      // Separate _assessment object from signals
      let assessment = { sufficient: false, missing: ['specific_details'] };
      const signals = [];

      for (const item of (Array.isArray(rawSignals) ? rawSignals : [rawSignals])) {
        if (item._assessment) {
          assessment = {
            sufficient: !!item._assessment.sufficient,
            missing: Array.isArray(item._assessment.missing) ? item._assessment.missing : [],
          };
          continue;
        }
        signals.push(item);
      }

      // Also check for _assessment as a separate JSON object after the array
      const assessmentMatch = responseText.match(/\{"_assessment"\s*:\s*\{[^}]+\}\s*\}/);
      if (assessmentMatch) {
        try {
          const parsed = JSON.parse(assessmentMatch[0]);
          if (parsed._assessment) {
            assessment = {
              sufficient: !!parsed._assessment.sufficient,
              missing: Array.isArray(parsed._assessment.missing) ? parsed._assessment.missing : [],
            };
          }
        } catch { /* use default */ }
      }

      // Validate signals (same rules as batch extractor)
      const valid = signals.filter((s) => {
        if (!VALID_SIGNAL_TYPES.has(s.signal_type)) return false;
        if (!VALID_EVIDENCE_TYPES.has(s.evidence_type)) {
          s.evidence_type = 'observational_reported_fact';
        }
        if (INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES.has(s.signal_type) &&
            s.evidence_type === 'observational_reported_fact') {
          return false;
        }
        return true;
      });

      return { signals: valid, assessment };
    },
  };
}
