import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createReportBuildService } from '../../../../business_modules/report_build/app/reportBuildService.js';

function createMemoryStores() {
  let nextId = 1;
  const drafts = new Map();
  const conversations = new Map();

  const draftStore = {
    create(ownerKey) {
      const id = `d${nextId++}`;
      drafts.set(id, {
        id,
        owner_key: ownerKey,
        structured_state: {},
        turn_history: [],
        approved_draft: '',
      });
      return id;
    },
    get(id) {
      return drafts.get(id) ?? null;
    },
    updateStructured(id, structuredState) {
      const d = drafts.get(id);
      if (!d) throw new Error('missing draft');
      d.structured_state = structuredState ?? {};
    },
    appendTurn(id, turn) {
      const d = drafts.get(id);
      if (!d) throw new Error('missing draft');
      d.turn_history.push(turn);
    },
    setApprovedDraft(id, draftText) {
      const d = drafts.get(id);
      if (!d) throw new Error('missing draft');
      d.approved_draft = draftText ?? '';
    },
    markSubmitted() {},
    deleteById(id) {
      drafts.delete(id);
    },
  };

  const conversationStore = {
    get(ownerKey) {
      return conversations.get(ownerKey) ?? null;
    },
    upsert(ownerKey, state, draftId = null) {
      conversations.set(ownerKey, { owner_key: ownerKey, state, draft_id: draftId, updated_at: new Date().toISOString() });
    },
    reset(ownerKey) {
      conversations.delete(ownerKey);
    },
  };

  return { draftStore, conversationStore };
}

describe('reportBuildService', () => {
  it('returns followup questions when insufficient and draft preview when sufficient', async () => {
    const { draftStore, conversationStore } = createMemoryStores();
    let callCount = 0;

    const analyzerPort = {
      async analyzeTurnHistory() {
        callCount += 1;
        if (callCount === 1) {
          return {
            structured: {
              observation: { locality: 'אשקלון', behavior: null, spread: null, sourceBasis: null },
              componentLinks: [],
            },
            assessment: { topQuestions: ['מה בדיוק ראית?', 'זה מקרה בודד או רחב?'] },
          };
        }
        return {
          structured: {
            observation: { locality: 'אשקלון', behavior: 'תושבים לא נכנסים למרחב מוגן', spread: 'noticeable', sourceBasis: 'direct' },
            componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'negative', rationale: 'תצפית' }],
          },
          assessment: { topQuestions: [] },
        };
      },
    };

    let draftRagReceived = null;
    const draftGeneratorPort = {
      async generate(_structured, _turns, ragContext) {
        draftRagReceived = ragContext;
        return 'טיוטה קצרה בעברית.';
      },
    };

    const svc = createReportBuildService({
      analyzerPort,
      draftGeneratorPort,
      conversationStore,
      draftStore,
      retrievalService: null,
    });

    svc.startSession({ ownerKey: 'u1' });
    const first = await svc.applyTurn({ ownerKey: 'u1', text: 'ראיתי משהו', displayName: 'User' });
    assert.strictEqual(first.state, 'collecting');
    assert.ok(Array.isArray(first.followupQuestions));
    assert.ok(first.followupQuestions.length > 0);

    const second = await svc.applyTurn({ ownerKey: 'u1', text: 'פרטים נוספים', displayName: 'User' });
    assert.strictEqual(second.state, 'confirming');
    assert.strictEqual(typeof second.draftPreview, 'string');
    assert.ok(second.draftPreview.includes('טיוטה'));
    assert.ok(draftRagReceived === null || typeof draftRagReceived.blockText === 'string');
  });

  it('suggestFromText returns questions without persisting turns or conversation', async () => {
    const { draftStore, conversationStore } = createMemoryStores();

    const analyzerPort = {
      async analyzeTurnHistory() {
        return {
          structured: {
            observation: { locality: 'אשקלון', behavior: null, spread: null, sourceBasis: null },
            componentLinks: [],
          },
          assessment: { topQuestions: ['מה בדיוק ראית?', 'זה מקרה בודד או רחב?'] },
        };
      },
    };
    const draftGeneratorPort = { async generate() { return 'טיוטה'; } };
    const svc = createReportBuildService({ analyzerPort, draftGeneratorPort, conversationStore, draftStore });

    const out = await svc.suggestFromText({ ownerKey: 'u3', text: 'ראיתי משהו', displayName: 'User' });
    assert.strictEqual(out.sufficient, false);
    assert.ok(Array.isArray(out.followupQuestions));
    assert.ok(out.followupQuestions.length > 0);

    assert.strictEqual(conversationStore.get('u3'), null);
    assert.strictEqual(draftStore.get('d1'), null);
  });

  it('suggestFromText returns generic questions when analyzer provides no hints', async () => {
    const { draftStore, conversationStore } = createMemoryStores();

    const analyzerPort = {
      async analyzeTurnHistory() {
        return {
          structured: {
            observation: { locality: 'my region', behavior: 'decline in protection seeking', spread: 'noticeable', sourceBasis: 'direct' },
            componentLinks: [],
          },
          assessment: { topQuestions: [] },
        };
      },
    };
    const draftGeneratorPort = { async generate() { return 'טיוטה'; } };
    const svc = createReportBuildService({ analyzerPort, draftGeneratorPort, conversationStore, draftStore });

    const out = await svc.suggestFromText({ ownerKey: 'u4', text: 'text', displayName: '' });
    assert.strictEqual(out.sufficient, false);
    assert.ok(Array.isArray(out.followupQuestions));
    assert.ok(out.followupQuestions.length > 0);
  });

  it('suggestFromText is conservative about inferred spread/sourceBasis', async () => {
    const { draftStore, conversationStore } = createMemoryStores();

    const analyzerPort = {
      async analyzeTurnHistory() {
        return {
          structured: {
            observation: { locality: 'Hadera', behavior: 'decline in adherence', spread: 'noticeable', sourceBasis: 'direct' },
            componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'negative', rationale: 'x' }],
          },
          assessment: { topQuestions: [] },
        };
      },
    };
    const draftGeneratorPort = { async generate() { return 'טיוטה'; } };
    const svc = createReportBuildService({ analyzerPort, draftGeneratorPort, conversationStore, draftStore });

    // No explicit spread/source cues → should still ask questions (sufficient should be false)
    const out = await svc.suggestFromText({ ownerKey: 'u5', text: 'decline in adherence in Hadera', displayName: '' });
    assert.strictEqual(out.sufficient, false);
    assert.ok(out.followupQuestions.length > 0);
  });

  it('confirmAndClose clears conversation and returns draftText', async () => {
    const { draftStore, conversationStore } = createMemoryStores();

    const analyzerPort = {
      async analyzeTurnHistory() {
        return {
          structured: {
            observation: { locality: 'תל אביב', behavior: 'דוגמה', spread: 'isolated', sourceBasis: 'direct' },
            componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'mixed', rationale: 'x' }],
          },
          assessment: { topQuestions: [] },
        };
      },
    };
    const draftGeneratorPort = { async generate() { return 'טיוטה'; } };
    const svc = createReportBuildService({ analyzerPort, draftGeneratorPort, conversationStore, draftStore });

    svc.startSession({ ownerKey: 'u2' });
    await svc.applyTurn({ ownerKey: 'u2', text: 'טקסט', displayName: '' });
    const out = svc.confirmAndClose({ ownerKey: 'u2' });
    assert.strictEqual(out.ok, true);
    assert.strictEqual(out.draftText, 'טיוטה');
    assert.strictEqual(conversationStore.get('u2'), null);
  });
});

