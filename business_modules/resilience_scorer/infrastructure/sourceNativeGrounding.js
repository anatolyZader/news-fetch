/**
 * Source-native grounding for short-ingest channels (WhatsApp realtime, social).
 */

import {
  verifySourceNativeQuote,
  resolveQuoteText,
} from './signalVerification.js';
import {
  GROUNDING_TIER,
  assignGroundingFields,
  groundingMetaFromVerifyPass,
  isCriticalForGrounding,
  
} from '../domain/services/signals/groundingPolicy.js';

/**
 * Anchor signals to immutable ingest text; assign grounding tier.
 *
 * @param {object[]} signals
 * @param {string} sourceText raw message / quote_original
 * @param {{ source_type?: string }} [opts]
 * @returns {object[]}
 */
export function applySourceNativeGrounding(signals, sourceText, opts = {}) {
  if (!Array.isArray(signals) || !sourceText) return signals ?? [];

  for (const s of signals) {
    if (!s || typeof s !== 'object') continue;
    s.source_text = sourceText;
    if (opts.source_type) s.source_type = s.source_type ?? opts.source_type;

    const quote = resolveQuoteText(s);
    const result = verifySourceNativeQuote(quote, sourceText);
    if (result.ok) {
      if (!s.evidence_quote) s.evidence_quote = quote;
      assignGroundingFields(s, groundingMetaFromVerifyPass(result));
    } else if (isCriticalForGrounding(s)) {
      assignGroundingFields(s, {
        tier: GROUNDING_TIER.unverified_critical,
        reason: 'source_native_miss_critical',
        method: 'source_native',
      });
    } else {
      assignGroundingFields(s, {
        tier: GROUNDING_TIER.weak,
        reason: result.reason ?? 'source_native_miss',
        method: 'source_native',
      });
    }
  }
  return signals;
}



export {groundingMetaFromEntailmentFail} from '../domain/services/signals/groundingPolicy.js';