import { computeGaps, mergeStructured } from '../domain/gapEngine.js';
import { EVIDENCE_REQUIREMENTS } from '../domain/evidenceRequirements.js';

const MAX_COLLECTING_TURNS = 6;

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
  draftGeneratorPort,
  conversationStore,
  draftStore,
  maxCollectingTurns = MAX_COLLECTING_TURNS,
}) {
  if (!analyzerPort) throw new Error('reportBuildService: analyzerPort is required');
  if (!draftGeneratorPort) throw new Error('reportBuildService: draftGeneratorPort is required');
  if (!conversationStore) throw new Error('reportBuildService: conversationStore is required');
  if (!draftStore) throw new Error('reportBuildService: draftStore is required');

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
      const qs =
        Array.isArray(analysis?.assessment?.topQuestions) && analysis.assessment.topQuestions.length
          ? analysis.assessment.topQuestions
          : fallbackQuestionsFromGaps(rankedGaps);
      conversationStore.upsert(ownerKey, 'collecting', draftId);
      return {
        state: 'collecting',
        followupQuestions: qs.slice(0, 3),
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

