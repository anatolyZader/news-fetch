/**
 * End-to-end smoke test for the adaptive WhatsApp DM flow.
 *
 * Simulates:
 *   1) Officer sends substantive first message → bot asks follow-ups
 *   2) Officer answers → bot decides threshold met → shows prose draft preview
 *   3) Officer approves → evidenceStore receives item, signalStore receives signals
 *   4) Global commands: status, reset
 *
 * Run: node business_modules/whatsapp/test-dm-flow.js
 */

import { createWhatsAppMessageStore } from './infrastructure/whatsappMessageStore.js';
import { createWhatsAppSignalStore } from './infrastructure/whatsappSignalStore.js';
import { createWhatsAppConversationStore } from './infrastructure/whatsappConversationStore.js';
import { createWhatsAppReportDraftStore } from './infrastructure/whatsappReportDraftStore.js';
import { createWhatsAppIngestService } from './app/whatsappIngestService.js';

// ── Mock adapter that captures outbound messages ──────────────────────────
function createMockApiAdapter() {
  const sent = [];
  return {
    sent,
    verifyWebhook() { return { ok: true }; },
    async sendTextMessage(to, text) { sent.push({ to, msg: { type: 'text', body: text } }); return { ok: true }; },
    async sendMessage(to, msg) { sent.push({ to, msg }); return { ok: true }; },
    clearSent() { sent.length = 0; },
  };
}

function createMockEvidenceStore() {
  const items = [];
  return { items, insertItems(batch) { items.push(...batch); } };
}

// ── Mock resilience analyzer — scripted per call ──────────────────────────
function createScriptedAnalyzer(scripts) {
  let turnCall = 0;
  return {
    async analyzeTurnHistory(turnHistory, senderName) {
      const script = scripts.turn[turnCall] ?? scripts.turn[scripts.turn.length - 1];
      turnCall++;
      return typeof script === 'function' ? script(turnHistory, senderName) : script;
    },
    async analyzeMessage(text, senderName) {
      return scripts.message ?? { signals: [], assessment: { sufficient: true, missing: [] } };
    },
  };
}

function createScriptedDraftGenerator(draftText) {
  return { async generate() { return draftText; } };
}

// ── Webhook payload builders (stable across legacy tests) ────────────────
let msgCounter = 0;
function makeDmTextEntry(phone, text) {
  msgCounter++;
  return {
    changes: [{ value: {
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: phone, profile: { name: 'Test Officer' } }],
      messages: [{
        id: `wamid.test${msgCounter}`,
        from: phone,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'text',
        text: { body: text },
      }],
    }}],
  };
}
function makeDmButtonReplyEntry(phone, buttonId, buttonTitle) {
  msgCounter++;
  return {
    changes: [{ value: {
      messaging_product: 'whatsapp',
      contacts: [{ wa_id: phone, profile: { name: 'Test Officer' } }],
      messages: [{
        id: `wamid.test${msgCounter}`,
        from: phone,
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: 'interactive',
        interactive: { type: 'button_reply', button_reply: { id: buttonId, title: buttonTitle } },
      }],
    }}],
  };
}

function assert(cond, msg) { if (!cond) throw new Error(`FAIL: ${msg}`); }
function last(arr) { return arr[arr.length - 1]; }
function printSent(adapter, label) {
  console.log(`\n── ${label} ──`);
  for (const s of adapter.sent) {
    const m = s.msg;
    if (m.type === 'text') console.log(`  [text] ${m.body}`);
    else if (m.type === 'buttons') {
      console.log(`  [buttons] ${m.body}`);
      for (const b of m.buttons) console.log(`    • [${b.id}] ${b.title}`);
    } else if (m.type === 'list') {
      console.log(`  [list] ${m.body}`);
    }
  }
}

// ── Scripted analyzer scenario: fatigue-around-shelter-non-compliance ─────
const SCRIPT = {
  turn: [
    // Turn 1: officer's first message → extractor has partial info, asks follow-ups
    {
      signals: [{ signal_type: 'non_compliance_exit_early', evidence_type: 'observational_reported_fact', evidence: 'תושבים לא נכנסים למרחבים', scope_level: 'repeated_pattern' }],
      structured: {
        observation: { locality: 'מעלות', timeframe: null, behavior: 'תושבים לא נכנסים למרחבים במהלך התרעות UAV', affectedPopulation: 'residents', spread: null, sourceBasis: null, comparisonToPrior: null },
        interpretation: { possibleDrivers: ['fatigue'], alternatives: ['disbelief'] },
        componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'negative', rationale: 'non_compliance observed' }],
        confidence: { level: 'low', basis: 'single short message' },
      },
      assessment: {
        sufficient: false,
        missing: ['source_basis', 'spread'],
        missingByComponent: [{ componentId: 'lifesaving_behavior', requiredFields: ['sourceBasis', 'spread'], disambiguation: ['driver'] }],
        topQuestions: [
          'האם זו תצפית ישירה שלך, דיווח מצוות, או מה שתושבים סיפרו?',
          'זו התנהגות של מעט תושבים או תופעה רחבה?',
        ],
      },
    },
    // Turn 2: officer provided source + spread → now sufficient
    {
      signals: [{ signal_type: 'non_compliance_exit_early', evidence_type: 'observational_reported_fact', evidence: 'תופעה רחבה של אי-כניסה למרחבים', scope_level: 'repeated_pattern' }],
      structured: {
        observation: { locality: 'מעלות', timeframe: 'הבוקר', behavior: 'תושבים רבים לא נכנסים למרחבים בהתרעות UAV', affectedPopulation: 'residents', spread: 'widespread', sourceBasis: 'staff', comparisonToPrior: 'new' },
        interpretation: { possibleDrivers: ['fatigue', 'disbelief'], alternatives: [] },
        componentLinks: [{ componentId: 'lifesaving_behavior', direction: 'negative', rationale: 'widespread non-compliance driven by fatigue' }],
        confidence: { level: 'medium', basis: 'staff reports + direct observation' },
      },
      assessment: {
        sufficient: true,
        missing: [],
        missingByComponent: [],
        topQuestions: [],
      },
    },
  ],
  message: {
    signals: [{ signal_type: 'non_compliance_exit_early', evidence_type: 'observational_reported_fact', evidence: 'תושבים רבים לא נכנסים למרחבים בהתרעות', scope_level: 'repeated_pattern' }],
    assessment: { sufficient: true, missing: [] },
  },
};

const DRAFT_TEXT = 'במעלות דיווחו בבוקר האחרון על תופעה רחבה של תושבים שאינם נכנסים למרחבים מוגנים בהתרעות UAV. הדיווח מבוסס על תצפיות צוות מקומי וחדש לעומת השבוע שעבר. לדברי התושבים, הגורם הדומיננטי הוא עייפות מהתרעות חוזרות, לצד חוסר אמון באיום.';

// ── Run tests ─────────────────────────────────────────────────────────────
const PHONE = '972501234567';

const adapter = createMockApiAdapter();
const evidenceStore = createMockEvidenceStore();
const analyzer = createScriptedAnalyzer(SCRIPT);
const draftGenerator = createScriptedDraftGenerator(DRAFT_TEXT);
const draftStore = createWhatsAppReportDraftStore(':memory:');
const signalStore = createWhatsAppSignalStore(':memory:');

const service = createWhatsAppIngestService({
  messageStore: createWhatsAppMessageStore(':memory:'),
  apiAdapter: adapter,
  evidenceStore,
  signalStore,
  resilienceAnalyzer: analyzer,
  draftGenerator,
  conversationStore: createWhatsAppConversationStore(':memory:'),
  draftStore,
  allowedGroupIds: [],
});

async function runTests() {
  console.log('=== Adaptive WhatsApp DM Flow Tests ===\n');

  // ── Test 1: substantive first message → extractor runs → follow-ups sent
  adapter.clearSent();
  await service.handleIncomingMessage(makeDmTextEntry(PHONE, 'תושבים במעלות כבר לא נכנסים למרחבים בהתרעות UAV'));
  printSent(adapter, 'Test 1: first substantive message → adaptive follow-ups');
  assert(adapter.sent.length >= 1, 'should send at least 1 reply');
  const firstReply = last(adapter.sent).msg;
  assert(firstReply.type === 'text', 'first reply after extract should be text');
  assert(firstReply.body.includes('תצפית ישירה') || firstReply.body.includes('מעט תושבים'),
    'should include LLM-phrased follow-up questions');
  console.log('  ✓ PASS');

  // ── Test 2: officer answers → sufficiency met → draft preview shown
  adapter.clearSent();
  await service.handleIncomingMessage(makeDmTextEntry(PHONE, 'צוות מקומי מדווח, זו תופעה רחבה בכל השכונה בבוקר. לדבריהם עייפות.'));
  printSent(adapter, 'Test 2: answers → sufficiency met → draft preview');
  const previewReply = last(adapter.sent).msg;
  assert(previewReply.type === 'buttons', 'draft preview should be buttons');
  assert(previewReply.body.includes('טיוטת הדיווח'), 'should be labelled as draft');
  assert(previewReply.body.includes('מעלות'), 'draft should contain locality from scripted draft');
  assert(previewReply.buttons.some(b => b.id === 'confirm_yes'), 'should have approve button');
  assert(previewReply.buttons.some(b => b.id === 'confirm_add_example'), 'should have add-example button');
  console.log('  ✓ PASS');

  // ── Test 3: approve → submit → evidenceStore + signalStore populated
  adapter.clearSent();
  await service.handleIncomingMessage(makeDmButtonReplyEntry(PHONE, 'confirm_yes', 'אישור ושליחה'));
  printSent(adapter, 'Test 3: approve → submit');
  assert(adapter.sent.some(s => s.msg.body?.includes('נשלח')), 'should confirm submission');
  assert(evidenceStore.items.length === 1, 'should store 1 evidence item');
  assert(evidenceStore.items[0].body === DRAFT_TEXT, 'evidence body should be the approved prose draft');
  assert(evidenceStore.items[0].source_type === 'whatsapp_dm', 'source type should be whatsapp_dm');
  const storedSignals = signalStore.getByDate(evidenceStore.items[0].date);
  assert(storedSignals.length >= 1, 'should have at least 1 signal stored after submit');
  console.log(`  ✓ PASS (draft="${DRAFT_TEXT.slice(0, 50)}...", signals=${storedSignals.length})`);

  // ── Test 4: global commands still work after submit
  adapter.clearSent();
  await service.handleIncomingMessage(makeDmTextEntry(PHONE, 'שלום'));
  printSent(adapter, 'Test 4: greeting after submit → welcome menu');
  assert(adapter.sent[0].msg.type === 'buttons', 'should show welcome menu');
  console.log('  ✓ PASS');

  // ── Test 5: reset command clears everything
  adapter.clearSent();
  await service.handleIncomingMessage(makeDmTextEntry(PHONE, 'תושבים בנהריה מפחדים'));
  adapter.clearSent();
  await service.handleIncomingMessage(makeDmTextEntry(PHONE, 'איפוס'));
  printSent(adapter, 'Test 5: reset mid-conversation');
  assert(adapter.sent[0].msg.body.includes('בוטל'), 'should confirm cancellation');
  console.log('  ✓ PASS');

  console.log('\n=== All tests passed ===\n');
}

runTests().catch((err) => {
  console.error('\n✗ TEST FAILED:', err.stack || err.message);
  process.exit(1);
});
