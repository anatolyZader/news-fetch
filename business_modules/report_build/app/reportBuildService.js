import { computeGaps, mergeStructured } from '../domain/gapEngine.js';
import { EVIDENCE_REQUIREMENTS } from '../domain/evidenceRequirements.js';
import { createHash } from 'node:crypto';

const MAX_COLLECTING_TURNS = 6;
const SUGGEST_CACHE_TTL_MS = 90_000;

function fallbackQuestionsFromGaps(rankedGaps) {
  if (!rankedGaps?.length) return [];
  const seen = new Set();
  const result = [];
  for (const gap of rankedGaps) {
    if (result.length >= 3) break;
    if (gap.componentId) {
      const req = EVIDENCE_REQUIREMENTS[gap.componentId];
      if (req?.fallbackQuestions?.length) {
        for (const q of req.fallbackQuestions) {
          if (seen.has(q)) continue;
          seen.add(q);
          result.push(q);
          if (result.length >= 3) break;
        }
      }
    } else if (gap.field === 'locality') {
      if (!seen.has('locality')) {
        seen.add('locality');
        result.push('באיזה יישוב או אזור מדובר?');
      }
    } else if (gap.field === 'sourceBasis') {
      if (!seen.has('sourceBasis')) {
        seen.add('sourceBasis');
        result.push('האם זו תצפית ישירה שלך, דיווח מצוות מקומי, או מה שתושבים סיפרו?');
      }
    } else if (gap.field === 'spread') {
      if (!seen.has('spread')) {
        seen.add('spread');
        result.push('זה מקרה בודד, תופעה באזור מוגדר, או רחבה יותר?');
      }
    } else if (gap.field === 'observedBehavior') {
      if (!seen.has('observedBehavior')) {
        seen.add('observedBehavior');
        result.push('מה בדיוק ראית או שמעת? כמה דוגמאות קונקרטיות.');
      }
    }
  }
  return result;
}

function nowIso() {
  return new Date().toISOString();
}

function safeText(x) {
  const t = String(x ?? '').trim();
  return t;
}

function hasSourceBasisCue(text) {
  const t = String(text ?? '').toLowerCase();
  // direct observation cues
  if (/\b(i saw|i see|i observed|i witnessed)\b/.test(t)) return true;
  if (/[א-ת]ראיתי|תצפית|תצפיתי/.test(t)) return true;
  // staff cues
  if (/\b(staff|team|guard|security|municipality|welfare)\b/.test(t)) return true;
  if (/צוות|מאבטח|אבטחה|עירייה|רווחה|שוטר/.test(t)) return true;
  // residents cues
  if (/\b(residents|people told|they told me|locals said)\b/.test(t)) return true;
  if (/תושבים|אמרו לי|סיפרו לי|לדבריהם/.test(t)) return true;
  return false;
}

function hasSpreadCue(text) {
  const t = String(text ?? '').toLowerCase();
  // explicit quantification or common spread words
  if (/\b(\d+|dozens|hundreds|many|most|few)\b/.test(t)) return true;
  if (/[0-9]+|עשרות|מאות|רבים|מרבית|מעטים|המון/.test(t)) return true;
  if (/\b(isolated|widespread|across|throughout)\b/.test(t)) return true;
  if (/בודד|נקודתי|נרחב|בכל|ברחבי/.test(t)) return true;
  return false;
}

function conservativeStructuredForSuggest(cleanText, structured) {
  const out = structured && typeof structured === 'object' ? structured : {};
  const obs = out.observation && typeof out.observation === 'object' ? out.observation : {};

  // If the model filled these without any cues in the text, treat as unknown to keep questions useful.
  if (obs.sourceBasis && !hasSourceBasisCue(cleanText)) obs.sourceBasis = null;
  if (obs.spread && !hasSpreadCue(cleanText)) obs.spread = null;

  out.observation = obs;
  return out;
}

function normalizeSuggestText(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replaceAll(/\s+/g, ' ');
}

function sha1Hex(s) {
  return createHash('sha1').update(s).digest('hex');
}

function pickQuestionsFromAnalysisOrGaps(analysis, rankedGaps) {
  const qs =
    Array.isArray(analysis?.assessment?.topQuestions) && analysis.assessment.topQuestions.length
      ? analysis.assessment.topQuestions
      : fallbackQuestionsFromGaps(rankedGaps);
  if (qs.length) return qs.slice(0, 3);

  // Edge case: report is insufficient but gap ranking yields no actionable
  // fields (e.g., missing componentLinks). Provide a small generic set.
  return [
    'מה בדיוק ראית או שמעת? כמה דוגמאות קונקרטיות.',
    'באיזה יישוב או אזור מדובר?',
    'האם זו תצפית ישירה שלך, דיווח מצוות מקומי, או מה שתושבים סיפרו?',
  ];
}

/**
 * Shared orchestrator for interactive report-building (WhatsApp + Web).
 *
 * The stores are duck-typed; WhatsApp can pass its own stores, and the web uses
 * the `report_build` SQLite stores.
 *
 * @param {{
 *   analyzerPort: { analyzeTurnHistory: Function },
 *   draftGeneratorPort: { generate: Function },
 *   conversationStore: { get: Function, upsert: Function, reset: Function },
 *   draftStore: { create: Function, get: Function, updateStructured: Function, appendTurn: Function, setApprovedDraft: Function, markSubmitted?: Function, deleteById?: Function },
 *   maxCollectingTurns?: number,
 * }} deps
 */
export function createReportBuildService({
  analyzerPort,
  suggestAnalyzerPort = null,
  draftGeneratorPort,
  conversationStore,
  draftStore,
  maxCollectingTurns = MAX_COLLECTING_TURNS,
}) {
  if (!analyzerPort) throw new Error('reportBuildService: analyzerPort is required');
  if (!draftGeneratorPort) throw new Error('reportBuildService: draftGeneratorPort is required');
  if (!conversationStore) throw new Error('reportBuildService: conversationStore is required');
  if (!draftStore) throw new Error('reportBuildService: draftStore is required');

  const suggestCache = new Map();

  return {
    /**
     * Start or reset an interactive report build session.
     * @param {{ ownerKey: string }} params
     */
    startSession({ ownerKey }) {
      if (!ownerKey) throw new Error('ownerKey required');
      const existing = conversationStore.get(ownerKey);
      if (existing?.draft_id && draftStore.deleteById) {
        try {
          draftStore.deleteById(existing.draft_id);
        } catch {
          /* ok */
        }
      }
      conversationStore.reset(ownerKey);

      const draftId = draftStore.create(ownerKey);
      conversationStore.upsert(ownerKey, 'collecting', draftId);
      return { state: 'collecting', draftId };
    },

    /**
     * Apply one user/officer text turn and return next UI state.
     * @param {{ ownerKey: string, text: string, displayName?: string, role?: 'officer'|'bot' }} params
     */
    async applyTurn({ ownerKey, text, displayName = '', role = 'officer' }) {
      if (!ownerKey) throw new Error('ownerKey required');
      const clean = safeText(text);
      if (!clean) return { state: 'collecting', followupQuestions: [] };

      let conv = conversationStore.get(ownerKey);
      if (!conv?.draft_id) {
        const draftId = draftStore.create(ownerKey);
        conversationStore.upsert(ownerKey, 'collecting', draftId);
        conv = conversationStore.get(ownerKey);
      }

      const draftId = conv.draft_id;
      const draft = draftStore.get(draftId);
      if (!draft) throw new Error('draft not found');

      draftStore.appendTurn(draftId, { role, text: clean, ts: nowIso() });
      return await recomputeInternal({ ownerKey, displayName, draftId });
    },

    /**
     * Re-run analysis/gap/draft steps using the *existing* stored turn history.
     * Useful when the caller already appended turns (e.g. WhatsApp orchestrator).
     *
     * @param {{ ownerKey: string, displayName?: string }} params
     */
    async recompute({ ownerKey, displayName = '' }) {
      if (!ownerKey) throw new Error('ownerKey required');
      const conv = conversationStore.get(ownerKey);
      const draftId = conv?.draft_id;
      if (!draftId) return { state: 'collecting', followupQuestions: [] };
      return await recomputeInternal({ ownerKey, displayName, draftId });
    },

    /**
     * Suggest follow-up questions from the current free-typed text, without
     * persisting a turn or advancing the conversation state.
     *
     * @param {{ ownerKey: string, text: string, displayName?: string }} params
     */
    async suggestFromText({ ownerKey, text, displayName = '' }) {
      if (!ownerKey) throw new Error('ownerKey required');
      const clean = safeText(text);
      if (!clean) return { sufficient: false, followupQuestions: [] };

      const norm = normalizeSuggestText(clean);
      const key = `${ownerKey}:${sha1Hex(norm)}`;
      const now = Date.now();
      const cached = suggestCache.get(key);
      if (cached && cached.expiresAt > now) return cached.value;
      if (cached) suggestCache.delete(key);

      const scratchTurns = [{ role: 'officer', text: clean, ts: nowIso() }];
      const analyzer = suggestAnalyzerPort ?? analyzerPort;
      const analysis = await analyzer.analyzeTurnHistory(scratchTurns, displayName);
      const structured = conservativeStructuredForSuggest(clean, analysis?.structured ?? {});
      const { sufficient, rankedGaps } = computeGaps(structured);

      const value = sufficient
        ? { sufficient: true, followupQuestions: [] }
        : { sufficient: false, followupQuestions: pickQuestionsFromAnalysisOrGaps(analysis, rankedGaps) };

      suggestCache.set(key, { expiresAt: now + SUGGEST_CACHE_TTL_MS, value });
      // Best-effort pruning (keep memory bounded).
      if (suggestCache.size > 500) {
        for (const [k, v] of suggestCache) {
          if (v.expiresAt <= now) suggestCache.delete(k);
          if (suggestCache.size <= 400) break;
        }
      }

      return value;
    },

    /**
     * Finalize and clear the session; returns the final draft text.
     * @param {{ ownerKey: string }} params
     */
    confirmAndClose({ ownerKey }) {
      if (!ownerKey) throw new Error('ownerKey required');
      const conv = conversationStore.get(ownerKey);
      const draftId = conv?.draft_id;
      if (!draftId) {
        conversationStore.reset(ownerKey);
        return { ok: false, draftText: '' };
      }
      const draft = draftStore.get(draftId);
      const draftText = String(draft?.approved_draft ?? '').trim();
      if (draftStore.markSubmitted) {
        try {
          draftStore.markSubmitted(draftId);
        } catch {
          /* ok */
        }
      }
      conversationStore.reset(ownerKey);
      return { ok: !!draftText, draftText, draftId };
    },

    cancel({ ownerKey }) {
      if (!ownerKey) throw new Error('ownerKey required');
      const conv = conversationStore.get(ownerKey);
      if (conv?.draft_id && draftStore.deleteById) {
        try {
          draftStore.deleteById(conv.draft_id);
        } catch {
          /* ok */
        }
      }
      conversationStore.reset(ownerKey);
      return { ok: true };
    },
  };

  async function recomputeInternal({ ownerKey, displayName, draftId }) {
    const updated = draftStore.get(draftId);
    const turnHistory = Array.isArray(updated?.turn_history) ? updated.turn_history : [];
    const officerTurnCount = turnHistory.filter((t) => t.role === 'officer').length;

    const analysis = await analyzerPort.analyzeTurnHistory(turnHistory, displayName);
    const merged = mergeStructured(updated?.structured_state ?? {}, analysis.structured ?? {});
    draftStore.updateStructured(draftId, merged);

    const { sufficient, rankedGaps } = computeGaps(merged);
    const shouldForceDraft = officerTurnCount >= maxCollectingTurns;

    if (!sufficient && !shouldForceDraft) {
      conversationStore.upsert(ownerKey, 'collecting', draftId);
      return {
        state: 'collecting',
        followupQuestions: pickQuestionsFromAnalysisOrGaps(analysis, rankedGaps),
        structuredState: merged,
      };
    }

    const draftText = await draftGeneratorPort.generate(merged, turnHistory);
    if (draftText) {
      draftStore.setApprovedDraft(draftId, draftText);
    }
    conversationStore.upsert(ownerKey, 'confirming', draftId);

    return {
      state: 'confirming',
      draftPreview: draftText,
      structuredState: merged,
    };
  }
}

