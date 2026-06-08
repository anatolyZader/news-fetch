import { computeGaps, mergeStructured } from '../domain/gapEngine.js';
import { EVIDENCE_REQUIREMENTS } from '../domain/evidenceRequirements.js';
import { buildReportBuildRagContext } from '../../../cross-cut-modules/retrieval/fieldRetrieval.js';
import { persistOriginalSources } from '../../../db/source_archive/persistOriginals.js';
import {
  buildLocalityPickerMessage,
  parseLocalityPickerReply,
  needsStructuredLocality,
} from '../domain/localityPicker.js';
import { createHash } from 'node:crypto';

const MAX_COLLECTING_TURNS = 6;
const SUGGEST_CACHE_TTL_MS = 90_000;

const FIELD_GAP_QUESTIONS = {
  sourceBasis: 'האם זו תצפית ישירה שלך, דיווח מצוות מקומי, או מה שתושבים סיפרו?',
  spread: 'זה מקרה בודד, תופעה באזור מוגדר, או רחבה יותר?',
  observedBehavior: 'מה בדיוק ראית או שמעת? כמה דוגמאות קונקרטיות.',
};

function appendComponentFallbackQuestions(gap, seen, result) {
  const req = EVIDENCE_REQUIREMENTS[gap.componentId];
  if (!req?.fallbackQuestions?.length) return;
  for (const q of req.fallbackQuestions) {
    if (seen.has(q)) continue;
    seen.add(q);
    result.push(q);
    if (result.length >= 3) break;
  }
}

function appendFieldGapQuestion(gap, seen, result, geoLocalityPort) {
  if (seen.has(gap.field)) return;
  seen.add(gap.field);
  if (gap.field === 'locality') {
    if (geoLocalityPort?.searchLocalities) {
      const options = geoLocalityPort.searchLocalities('', { scope: 'north', limit: 10 });
      result.push(buildLocalityPickerMessage(options));
    } else {
      result.push('באיזה יישוב או אזור מדובר?');
    }
    return;
  }
  const question = FIELD_GAP_QUESTIONS[gap.field];
  if (question) result.push(question);
}

function fallbackQuestionsFromGaps(rankedGaps, geoLocalityPort) {
  if (!rankedGaps?.length) return [];
  const seen = new Set();
  const result = [];
  for (const gap of rankedGaps) {
    if (result.length >= 3) break;
    if (gap.componentId) {
      appendComponentFallbackQuestions(gap, seen, result);
    } else {
      appendFieldGapQuestion(gap, seen, result, geoLocalityPort);
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
  if (/\d+|עשרות|מאות|רבים|מרבית|מעטים|המון/.test(t)) return true;
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

function getCachedSuggestValue(suggestCache, ownerKey, norm, now) {
  const key = `${ownerKey}:${sha1Hex(norm)}`;
  const cached = suggestCache.get(key);
  if (cached && cached.expiresAt > now) return { key, value: cached.value };
  if (cached) suggestCache.delete(key);
  return { key, value: null };
}

function pruneSuggestCache(suggestCache, now) {
  if (suggestCache.size <= 500) return;
  for (const [k, v] of suggestCache) {
    if (v.expiresAt <= now) suggestCache.delete(k);
    if (suggestCache.size <= 400) break;
  }
}

async function buildSuggestValue({
  clean,
  displayName,
  costRecorder,
  suggestAnalyzerPort,
  analyzerPort,
  geoLocalityPort,
}) {
  const scratchTurns = [{ role: 'officer', text: clean, ts: nowIso() }];
  const analyzer = suggestAnalyzerPort ?? analyzerPort;
  const onUsage = costRecorder ? (p) => costRecorder.onUsage(p) : null;
  const analysis = await analyzer.analyzeTurnHistory(scratchTurns, displayName, null, { onUsage });
  const structured = conservativeStructuredForSuggest(clean, analysis?.structured ?? {});
  const { sufficient, rankedGaps } = computeGaps(structured);
  return sufficient
    ? { sufficient: true, followupQuestions: [] }
    : { sufficient: false, followupQuestions: pickQuestionsFromAnalysisOrGaps(analysis, rankedGaps, geoLocalityPort) };
}

function pickQuestionsFromAnalysisOrGaps(analysis, rankedGaps, geoLocalityPort) {
  const qs =
    Array.isArray(analysis?.assessment?.topQuestions) && analysis.assessment.topQuestions.length
      ? analysis.assessment.topQuestions
      : fallbackQuestionsFromGaps(rankedGaps, geoLocalityPort);
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
 *   geoLocalityPort?: { searchLocalities?: Function, resolveLocalityName?: Function },
 *   retrievalService?: object|null,
 *   sourceArchive?: object|null,
 *   maxCollectingTurns?: number,
 * }} deps
 */
export function createReportBuildService({
  analyzerPort,
  suggestAnalyzerPort = null,
  draftGeneratorPort,
  conversationStore,
  draftStore,
  geoLocalityPort = null,
  retrievalService = null,
  sourceArchive = null,
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
    async applyTurn({ ownerKey, text, displayName = '', role = 'officer', costRecorder = null }) {
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

      if (geoLocalityPort?.searchLocalities && needsStructuredLocality(draft?.structured_state)) {
        const options = geoLocalityPort.searchLocalities('', { scope: 'north', limit: 10 });
        const picked = parseLocalityPickerReply(clean, options);
        if (picked) {
          draftStore.updateStructured(draftId, {
            ...draft?.structured_state,
            observation: {
              ...draft?.structured_state?.observation,
              localityKey: picked.canonicalKey,
              locality: picked.displayName,
            },
          });
        }
      }

      return await recomputeInternal({ ownerKey, displayName, draftId, costRecorder });
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
    async suggestFromText({ ownerKey, text, displayName = '', costRecorder = null }) {
      if (!ownerKey) throw new Error('ownerKey required');
      const clean = safeText(text);
      if (!clean) return { sufficient: false, followupQuestions: [] };

      const now = Date.now();
      const { key, value: cachedValue } = getCachedSuggestValue(suggestCache, ownerKey, normalizeSuggestText(clean), now);
      if (cachedValue) return cachedValue;

      const value = await buildSuggestValue({
        clean,
        displayName,
        costRecorder,
        suggestAnalyzerPort,
        analyzerPort,
        geoLocalityPort,
      });
      suggestCache.set(key, { expiresAt: now + SUGGEST_CACHE_TTL_MS, value });
      pruneSuggestCache(suggestCache, now);
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
      if (draftText && sourceArchive) {
        const date = new Date().toISOString().slice(0, 10);
        try {
          persistOriginalSources(sourceArchive, [{
            date,
            source_type: 'field',
            source_label: 'report_build-web',
            source_url: '',
            title: `Field report (web): ${draftText.slice(0, 60)}`,
            body: draftText,
            published_at: new Date().toISOString(),
          }]);
        } catch (err) {
          if (!err.message?.includes('UNIQUE constraint')) {
            console.error('report_build archive failed:', err.message);
          }
        }
      }
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

  async function recomputeInternal({ ownerKey, displayName, draftId, costRecorder = null }) {
    const updated = draftStore.get(draftId);
    const turnHistory = Array.isArray(updated?.turn_history) ? updated.turn_history : [];
    const officerTurnCount = turnHistory.filter((t) => t.role === 'officer').length;

    const analyzeRag = await buildReportBuildRagContext(
      updated?.structured_state ?? {},
      turnHistory,
      { retrievalService, mode: 'analyze' },
    );
    const onUsage = costRecorder
      ? (p) => costRecorder.onUsage(p)
      : null;
    const analysis = await analyzerPort.analyzeTurnHistory(turnHistory, displayName, analyzeRag, { onUsage });
    const merged = mergeStructured(updated?.structured_state ?? {}, analysis.structured ?? {});
    draftStore.updateStructured(draftId, merged);

    const { sufficient, rankedGaps } = computeGaps(merged);
    const shouldForceDraft = officerTurnCount >= maxCollectingTurns;

    if (!sufficient && !shouldForceDraft) {
      conversationStore.upsert(ownerKey, 'collecting', draftId);
      return {
        state: 'collecting',
        followupQuestions: pickQuestionsFromAnalysisOrGaps(analysis, rankedGaps, geoLocalityPort),
        structuredState: merged,
      };
    }

    const draftRag = await buildReportBuildRagContext(merged, turnHistory, {
      retrievalService,
      mode: 'draft',
    });
    const draftText = await draftGeneratorPort.generate(merged, turnHistory, draftRag, { onUsage });
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

