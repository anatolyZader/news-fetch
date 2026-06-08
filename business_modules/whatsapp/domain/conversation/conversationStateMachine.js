/**
 * Pure conversation state machine for the adaptive WhatsApp DM bot.
 *
 * States: idle → collecting → drafting → confirming → idle
 *
 * The machine is pure: `transition(state, msg, draft)` returns
 * `{ nextState, replies[], sideEffects[] }`. The app layer executes side
 * effects (create/append/delete drafts, run the LLM extractor loop, run the
 * draft generator, submit) and delivers replies.
 *
 * Async work (LLM calls) is modelled as two side-effect signals that the
 * orchestrator owns:
 *   - { type: 'run_extractor_loop' }   — call analyzer, merge structured state,
 *                                        run gap engine, send follow-up questions
 *                                        OR transition to drafting.
 *   - { type: 'run_draft_generator' }  — call draft generator, send preview,
 *                                        transition to confirming.
 *
 * The state returned here is the tentative next state; the orchestrator may
 * adjust it (e.g. after run_extractor_loop, collecting → drafting).
 */

import {
  buildWelcomeMenu, buildCollectingPrompt,
  buildSubmitSuccess, buildCancelConfirm, buildStatusMessage,
  buildHelpMessage, buildUnknownInput, 
  buildMediaWithoutCaption, buildEditPrompt, buildAddExamplePrompt,
} from './outboundMessageFactory.js';

// Hebrew/English global commands (trimmed, matched case-insensitively).
const GLOBAL_COMMANDS = new Set([
  'עזרה', 'תפריט', 'סטטוס', 'איפוס', 'ביטול',
  'help', 'menu', 'status', 'reset', 'cancel',
]);

function isSubstantiveText(text) {
  const t = (text ?? '').trim();
  if (!t) return false;
  if (GLOBAL_COMMANDS.has(t.toLowerCase())) return false;
  // Treat pure greetings as non-substantive — show the welcome menu instead of starting a report.
  const GREETING = new Set(['שלום', 'היי', 'הי', 'hi', 'hello', 'hey', 'בוקר טוב', 'ערב טוב']);
  if (GREETING.has(t.toLowerCase())) return false;
  return true;
}

function handleGlobalCommand(state, msg, draft, textLower, replies, sideEffects) {
  if (msg.type !== 'text' && msg.type !== 'button_reply') return null;

  const cmd = textLower;
  if (cmd === 'עזרה' || cmd === 'help' || msg.buttonReplyId === 'help') {
    replies.push(buildHelpMessage(), buildWelcomeMenu());
    return { nextState: state === 'idle' ? 'idle' : state, replies, sideEffects };
  }
  if (cmd === 'תפריט' || cmd === 'menu') {
    replies.push(buildWelcomeMenu());
    return { nextState: 'idle', replies, sideEffects };
  }
  if (cmd === 'סטטוס' || cmd === 'status' || msg.buttonReplyId === 'status') {
    replies.push(buildStatusMessage(draft, state));
    return { nextState: state, replies, sideEffects };
  }
  if (cmd === 'איפוס' || cmd === 'reset' || cmd === 'ביטול' || cmd === 'cancel') {
    if (draft) sideEffects.push({ type: 'delete_draft' });
    replies.push(buildCancelConfirm());
    return { nextState: 'idle', replies, sideEffects };
  }
  return null;
}

/**
 * @param {string} state  Current conversation state
 * @param {import('./inboundMessageNormalizer.js').NormalizedInbound} msg
 * @param {object|null} draft  Hydrated draft snapshot (from store) or null
 * @returns {{ nextState: string, replies: object[], sideEffects: object[] }}
 */
export function transition(state, msg, draft) {
  const replies = [];
  const sideEffects = [];
  const text = (msg.text ?? '').trim();
  const textLower = text.toLowerCase();

  const globalResult = handleGlobalCommand(state, msg, draft, textLower, replies, sideEffects);
  if (globalResult) return globalResult;

  // ── Media without text, outside collecting ─────────────────────────────
  if (msg.type === 'media' && !text && state !== 'collecting') {
    replies.push(buildMediaWithoutCaption());
    return { nextState: state, replies, sideEffects };
  }

  // ── State-specific routing ─────────────────────────────────────────────
  switch (state) {
    case 'idle':
      return handleIdle(msg, text, replies, sideEffects);

    case 'collecting':
      return handleCollecting(msg, text, replies, sideEffects);

    case 'drafting':
      // Transient; orchestrator normally drives us straight into `confirming`
      // via run_draft_generator. If we receive input here, treat it as
      // additional collecting input (officer wants to add more before the
      // draft appears).
      return handleCollecting(msg, text, replies, sideEffects);

    case 'confirming':
      return handleConfirming(msg, text, replies, sideEffects);

    default:
      // Unknown state — reset to idle safely.
      replies.push(buildWelcomeMenu());
      return { nextState: 'idle', replies, sideEffects };
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────

function handleIdle(msg, text, replies, sideEffects) {
  // Explicit start_report button click.
  if (msg.buttonReplyId === 'start_report') {
    sideEffects.push({ type: 'create_draft' });
    replies.push(buildCollectingPrompt());
    return { nextState: 'collecting', replies, sideEffects };
  }

  // Substantive first message — auto-start, use the text as the first turn.
  if ((msg.type === 'text' || msg.type === 'media') && isSubstantiveText(text)) {
    sideEffects.push({ type: 'create_draft' }, { type: 'append_turn_officer', text }, { type: 'run_extractor_loop' });
    return { nextState: 'collecting', replies, sideEffects };
  }

  // Greetings or empty — show welcome menu.
  replies.push(buildWelcomeMenu());
  return { nextState: 'idle', replies, sideEffects };
}

function handleCollecting(msg, text, replies, sideEffects) {
  if (msg.type === 'media' && !text) {
    replies.push(buildMediaWithoutCaption());
    return { nextState: 'collecting', replies, sideEffects };
  }

  if ((msg.type === 'text' || msg.type === 'media') && text) {
    sideEffects.push({ type: 'append_turn_officer', text }, { type: 'run_extractor_loop' });
    return { nextState: 'collecting', replies, sideEffects };
  }

  replies.push(buildUnknownInput());
  return { nextState: 'collecting', replies, sideEffects };
}

function handleConfirming(msg, text, replies, sideEffects) {
  if (msg.buttonReplyId === 'confirm_yes') {
    sideEffects.push({ type: 'submit_draft' });
    replies.push(buildSubmitSuccess());
    return { nextState: 'idle', replies, sideEffects };
  }

  if (msg.buttonReplyId === 'confirm_edit') {
    sideEffects.push({ type: 'append_turn_bot', text: 'לערוך' });
    replies.push(buildEditPrompt());
    return { nextState: 'collecting', replies, sideEffects };
  }

  if (msg.buttonReplyId === 'confirm_add_example') {
    sideEffects.push({ type: 'append_turn_bot', text: 'להוסיף דוגמה' });
    replies.push(buildAddExamplePrompt());
    return { nextState: 'collecting', replies, sideEffects };
  }

  // Free text in confirming — treat as an edit / continuation.
  if ((msg.type === 'text' || msg.type === 'media') && text) {
    sideEffects.push({ type: 'append_turn_officer', text }, { type: 'run_extractor_loop' });
    return { nextState: 'collecting', replies, sideEffects };
  }

  replies.push(buildUnknownInput());
  return { nextState: 'confirming', replies, sideEffects };
}

/** Exposed for orchestrator's internal use when a session expires. */


export {buildExpiredSession} from './outboundMessageFactory.js';