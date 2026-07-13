/**
 * Orchestrates WhatsApp message ingestion.
 *
 * DM flow: adaptive elicitation loop —
 *   idle → collecting (LLM extractor + gap engine, N turns)
 *        → drafting  (LLM draft generator)
 *        → confirming (approve / edit / add example)
 *        → idle (on submit)
 *
 * Group flow: store + single-shot LLM extraction + Hebrew follow-up reply.
 *   Preserved unchanged from the pre-adaptive implementation.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isAllowedGroup, isDmMessage, parseWebhookEntry } from '../domain/services/whatsappMessageFilter.js';
import { isDmPhoneAllowed } from '../../resilience_scorer/index.js';
import { buildAnalysisReply } from '../domain/services/hebrewResponseBuilder.js';
import { normalizeInboundMessage } from '../domain/conversation/inboundMessageNormalizer.js';
import { transition } from '../domain/conversation/conversationStateMachine.js';
import {
  buildExpiredSession, buildWelcomeMenu, buildFollowupQuestions, buildDraftPreview,
} from '../domain/conversation/outboundMessageFactory.js';
import { persistOriginalSources } from '../../../db/source_archive/persistOriginals.js';

const CONVERSATION_TTL_MINUTES = 60;

function isConversationExpired(updatedAt) {
  if (!updatedAt) return true;
  const updated = new Date(updatedAt + 'Z'); // SQLite datetime is UTC
  const now = new Date();
  return (now - updated) > CONVERSATION_TTL_MINUTES * 60 * 1000;
}

const DEFAULT_WHATSAPP_REPORT_DIR = 'business_modules/whatsapp/reports';
const DEFAULT_WHATSAPP_REPORT_BASENAME = 'whatsapp_reports';

function dmMessageTimestamps(msg) {
  const msgDate = new Date(Number(msg.timestamp) * 1000);
  return {
    date: msgDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }),
    timestampUtc: msgDate.toISOString(),
  };
}

function persistInboundDmMessage(messageStore, msg, normalized, date, timestampUtc) {
  messageStore.insert({
    metaMsgId: msg.metaMsgId,
    groupJid: null,
    senderPhone: msg.senderPhone,
    senderName: msg.senderName,
    messageText: normalized.text ?? '',
    timestampUtc,
    date,
  });
}

/**
 * @param {{
 *   messageStore, apiAdapter, evidenceStore, sourceArchive,
 *   signalStore?, resilienceAnalyzer?,
 *   draftGenerator?,
 *   reportBuildService?,
 *   conversationStore, draftStore,
 *   allowedGroupIds: string[]
 * }} deps
 */
function archiveWhatsAppBody(sourceArchive, evidenceStore, item) {
  if (!sourceArchive) {
    try {
      evidenceStore?.insertItems?.([item]);
    } catch (err) {
      if (!err.message?.includes('UNIQUE constraint')) throw err;
    }
    return;
  }
  try {
    persistOriginalSources(sourceArchive, [item], { evidenceStore });
  } catch (err) {
    if (!err.message?.includes('UNIQUE constraint')) throw err;
  }
}

export function createWhatsAppIngestService({
  messageStore, apiAdapter, evidenceStore, sourceArchive, signalStore,
  resilienceAnalyzer, draftGenerator,
  reportBuildService,
  conversationStore, draftStore, allowedGroupIds,
}) {
  return {
    /**
     * Process a single Meta webhook entry: parse messages, route DM vs group.
     * @param {object} entry  One element from request.body.entry[]
     */
    async handleIncomingMessage(entry) {
      const messages = parseWebhookEntry(entry);

      for (const msg of messages) {
        if (isDmMessage(msg.groupJid)) {
          await handleDmMessage(msg);
        } else if (isAllowedGroup(msg.groupJid, allowedGroupIds)) {
          await handleGroupMessage(msg);
        }
      }
    },

    /**
     * Export accumulated WhatsApp messages for a date to a markdown file
     * compatible with mdReportsLoader.js.
     * @param {string} date  YYYY-MM-DD
     * @returns {string|null} Path to written file, or null if no messages
     */
    exportToMarkdown(date) {
      const messages = messageStore.getByDate(date);
      if (!messages.length) {
        console.error(`No WhatsApp messages for ${date}`);
        return null;
      }

      const lines = [
        `# WhatsApp group articles (${date})`,
        '',
        `Total: ${messages.length} articles`,
        '',
      ];

      messages.forEach((msg, i) => {
        const senderLabel = msg.sender_name || msg.sender_phone;
        lines.push(`## ${i + 1}. ${senderLabel}: ${msg.message_text.slice(0, 80)}`, '', `- **URL:** whatsapp://msg/${msg.meta_msg_id}`, `- **Published:** ${msg.timestamp_utc}`, `- **Source:** WhatsApp`, '', msg.message_text, '', '---', '');
      });

      mkdirSync(resolve(DEFAULT_WHATSAPP_REPORT_DIR), { recursive: true });
      const outPath = resolve(
        DEFAULT_WHATSAPP_REPORT_DIR,
        `${DEFAULT_WHATSAPP_REPORT_BASENAME}-${date}.md`,
      );
      writeFileSync(outPath, lines.join('\n'), 'utf-8');
      console.error(`Wrote ${messages.length} WhatsApp messages to ${outPath}`);
      return outPath;
    },
  };

  // ── DM flow (adaptive chatbot) ─────────────────────────────────────────

  async function resetExpiredDmConversation(conv, phoneNumber) {
    if (conv.draft_id) {
      try { draftStore.deleteById(conv.draft_id); } catch { /* ok */ }
    }
    conversationStore.reset(phoneNumber);
    await sendReply(phoneNumber, buildExpiredSession());
    await sendReply(phoneNumber, buildWelcomeMenu());
  }

  async function applyExtractorLoopEffect(effectCtx) {
    const outcome = await runExtractorLoop({
      draftId: effectCtx.activeDraftId,
      normalized: effectCtx.normalized,
      timestampUtc: effectCtx.timestampUtc,
    });
    effectCtx.nextState = outcome.nextState;
    effectCtx.result.replies.push(...outcome.replies);
    if (!outcome.askDraftGenerator) return;
    const generated = await runDraftGenerator({ draftId: effectCtx.activeDraftId });
    effectCtx.result.replies.push(...generated.replies);
    effectCtx.nextState = generated.nextState;
  }

  async function applyDmSideEffect(effect, effectCtx) {
    switch (effect.type) {
      case 'create_draft':
        effectCtx.activeDraftId = draftStore.create(effectCtx.normalized.phoneNumber);
        break;
      case 'append_turn_officer':
        if (effectCtx.activeDraftId) {
          draftStore.appendTurn(effectCtx.activeDraftId, {
            role: 'officer', text: effect.text, ts: effectCtx.timestampUtc,
          });
        }
        break;
      case 'append_turn_bot':
        if (effectCtx.activeDraftId) {
          draftStore.appendTurn(effectCtx.activeDraftId, {
            role: 'bot', text: effect.text, ts: new Date().toISOString(),
          });
        }
        break;
      case 'run_extractor_loop':
        await applyExtractorLoopEffect(effectCtx);
        break;
      case 'submit_draft':
        if (effectCtx.activeDraftId) {
          await submitDraft(
            effectCtx.activeDraftId,
            effectCtx.normalized,
            effectCtx.date,
            effectCtx.timestampUtc,
          );
          effectCtx.forceSubmit = true;
        }
        effectCtx.activeDraftId = null;
        break;
      case 'delete_draft':
        if (effectCtx.activeDraftId) {
          try { draftStore.deleteById(effectCtx.activeDraftId); } catch { /* ok */ }
        }
        effectCtx.activeDraftId = null;
        break;
      default:
        break;
    }
  }

  function persistDmConversationState(phoneNumber, nextState, forceSubmit, activeDraftId) {
    if (nextState === 'idle' || forceSubmit) {
      conversationStore.reset(phoneNumber);
    } else {
      conversationStore.upsert(phoneNumber, nextState, activeDraftId);
    }
  }

  async function sendDmReplies(phoneNumber, replies, activeDraftId) {
    for (const reply of replies) {
      await sendReply(phoneNumber, reply);
      if (!activeDraftId || !reply?.body) continue;
      try {
        draftStore.appendTurn(activeDraftId, {
          role: 'bot', text: summarizeOutboundForTurn(reply), ts: new Date().toISOString(),
        });
      } catch { /* ok */ }
    }
  }

  async function handleDmMessage(msg) {
    if (!isDmPhoneAllowed(msg.senderPhone)) {
      console.error(`  → [whatsapp] DM from ${msg.senderPhone} rejected (not in allowlist)`);
      return;
    }

    const normalized = normalizeInboundMessage(msg, msg.rawMessage);
    if (messageStore.hasMsgId(msg.metaMsgId)) return;

    const { date, timestampUtc } = dmMessageTimestamps(msg);
    persistInboundDmMessage(messageStore, msg, normalized, date, timestampUtc);

    const conv = conversationStore.get(normalized.phoneNumber);
    const currentState = conv?.state ?? 'idle';
    if (conv && isConversationExpired(conv.updated_at)) {
      await resetExpiredDmConversation(conv, normalized.phoneNumber);
      return;
    }

    const activeDraftId = conv?.draft_id ?? null;
    const draft = activeDraftId ? draftStore.get(activeDraftId) : null;
    const result = transition(currentState, normalized, draft);
    const effectCtx = {
      normalized,
      date,
      timestampUtc,
      result,
      activeDraftId,
      nextState: result.nextState,
      forceSubmit: false,
    };

    for (const effect of result.sideEffects) {
      await applyDmSideEffect(effect, effectCtx);
    }

    persistDmConversationState(
      normalized.phoneNumber,
      effectCtx.nextState,
      effectCtx.forceSubmit,
      effectCtx.activeDraftId,
    );
    await sendDmReplies(normalized.phoneNumber, result.replies, effectCtx.activeDraftId);

    console.error(
      `WhatsApp DM processed: ${msg.metaMsgId} from ${msg.senderPhone} [${currentState} → ${effectCtx.nextState}]`,
    );
  }

  // ── Extractor loop ─────────────────────────────────────────────────────
  //
  // Runs the interactive analyzer on the full turn history, merges the new
  // structured state into the draft, and decides whether to keep collecting
  // or to hand off to the draft generator.
  async function runExtractorLoop({ draftId, normalized }) {
    if (!draftId) {
      return { nextState: 'collecting', replies: [buildFollowupQuestions([], 'תודה.')], askDraftGenerator: false };
    }

    // Preferred: shared report_build orchestrator (recompute on stored turns).
    if (reportBuildService?.recompute) {
      try {
        const out = await reportBuildService.recompute({
          ownerKey: normalized.phoneNumber,
          displayName: normalized.displayName,
        });
        if (out?.state === 'confirming' && out.draftPreview) {
          return {
            nextState: 'confirming',
            replies: [buildDraftPreview(out.draftPreview)],
            askDraftGenerator: false,
          };
        }
        const qs = Array.isArray(out?.followupQuestions) ? out.followupQuestions : [];
        return {
          nextState: 'collecting',
          replies: [buildFollowupQuestions(qs, 'תודה.')],
          askDraftGenerator: false,
        };
      } catch (err) {
        console.error(`reportBuildService recompute failed for draft ${draftId}:`, err.message);
        return {
          nextState: 'collecting',
          replies: [buildFollowupQuestions([], 'תודה. ספר עוד פרטים על מה שראית.')],
          askDraftGenerator: false,
        };
      }
    }

    // Fallback: legacy behavior (requires injected WhatsApp analyzer).
    if (!resilienceAnalyzer) {
      return { nextState: 'collecting', replies: [buildFollowupQuestions([], 'תודה.')], askDraftGenerator: false };
    }

    return { nextState: 'collecting', replies: [buildFollowupQuestions([], 'תודה.')], askDraftGenerator: false };
  }

  // ── Draft generator ───────────────────────────────────────────────────
  async function runDraftGenerator({ draftId }) {
    // With reportBuildService enabled, drafting happens inside runExtractorLoop via recompute().
    // Keep legacy fallback for safety when service isn't injected.
    if (!draftId || !draftGenerator) {
      return {
        nextState: 'collecting',
        replies: [buildFollowupQuestions([], 'אני צריך עוד פרטים לפני שאני יכול להכין טיוטה.')],
      };
    }
    const currentDraft = draftStore.get(draftId);
    if (!currentDraft) return { nextState: 'idle', replies: [] };

    let draftText;
    try {
      draftText = await draftGenerator.generate(currentDraft.structured_state ?? {}, currentDraft.turn_history ?? []);
    } catch (err) {
      console.error(`Draft generator failed for draft ${draftId}:`, err.message);
      return { nextState: 'collecting', replies: [buildFollowupQuestions([], 'ספר עוד פרט אחד ואני אכין טיוטה.')] };
    }

    if (!draftText) {
      return { nextState: 'collecting', replies: [buildFollowupQuestions([], 'עוד פרט אחד ואני אכין טיוטה.')] };
    }

    draftStore.setApprovedDraft(draftId, draftText);
    return { nextState: 'confirming', replies: [buildDraftPreview(draftText)] };
  }

  // ── Submit path (unchanged contract to downstream) ────────────────────
  async function submitDraft(draftId, normalized, date, timestampUtc) {
    const draft = draftStore.get(draftId);
    if (!draft) return;

    const approved = draft.approved_draft ?? composeFallbackNarrative(draft);

    archiveWhatsAppBody(sourceArchive, evidenceStore, {
      date,
      source_type: 'whatsapp',
      source_label: 'field_whatsapp',
      source_url: '',
      title: `WhatsApp DM: ${normalized.displayName || normalized.phoneNumber} — ${approved.slice(0, 60)}`,
      body: approved,
      published_at: timestampUtc,
    });

    // Run one more extraction on the approved narrative so the downstream
    // signals table reflects the final reviewed text (not an intermediate turn).
    if (resilienceAnalyzer && signalStore) {
      try {
        const analysis = await resilienceAnalyzer.analyzeMessage(approved, normalized.displayName, {
          sourceType: 'field_whatsapp',
          officerId: normalized.phoneNumber,
          visitTimestamp: timestampUtc,
        });
        if (analysis.signals.length > 0) {
          signalStore.insertSignals(normalized.metaMsgId, date, analysis.signals, normalized.phoneNumber);
          console.error(`WhatsApp DM signals extracted: ${analysis.signals.length} from draft ${draftId}`);
        }
      } catch (err) {
        console.error(`Resilience analysis failed for draft ${draftId}:`, err.message);
      }
    }

    draftStore.markSubmitted(draftId);
  }

  // ── Group flow (existing behavior, preserved verbatim) ────────────────
  async function handleGroupMessage(msg) {
    if (messageStore.hasMsgId(msg.metaMsgId)) return;

    const msgDate = new Date(Number(msg.timestamp) * 1000);
    const date = msgDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const timestampUtc = msgDate.toISOString();

    const inserted = messageStore.insert({
      metaMsgId: msg.metaMsgId,
      groupJid: msg.groupJid,
      senderPhone: msg.senderPhone,
      senderName: msg.senderName,
      messageText: msg.text,
      timestampUtc,
      date,
    });

    if (!inserted) return;

    archiveWhatsAppBody(sourceArchive, evidenceStore, {
      date,
      source_type: 'whatsapp',
      source_label: 'whatsapp-group',
      source_url: '',
      title: `WhatsApp: ${msg.senderName || msg.senderPhone} — ${msg.text.slice(0, 60)}`,
      body: msg.text,
      published_at: timestampUtc,
    });

    if (resilienceAnalyzer && signalStore) {
      try {
        const analysis = await resilienceAnalyzer.analyzeMessage(msg.text, msg.senderName);
        if (analysis.signals.length > 0) {
          signalStore.insertSignals(msg.metaMsgId, date, analysis.signals, msg.senderPhone);
          console.error(`WhatsApp signals extracted: ${analysis.signals.length} from ${msg.metaMsgId}`);
        }
        const reply = buildAnalysisReply(analysis);
        await apiAdapter.sendTextMessage(msg.senderPhone, reply);
      } catch (err) {
        console.error(`Resilience analysis failed for ${msg.metaMsgId}:`, err.message);
        try {
          await apiAdapter.sendTextMessage(msg.senderPhone, 'התקבל, תודה');
        } catch (replyErr) {
          console.error(`WhatsApp fallback reply failed:`, replyErr.message);
        }
      }
    } else {
      try {
        await apiAdapter.sendTextMessage(msg.senderPhone, 'התקבל, תודה');
      } catch (err) {
        console.error(`WhatsApp reply failed for ${msg.senderPhone}:`, err.message);
      }
    }

    console.error(`WhatsApp message ingested: ${msg.metaMsgId} from ${msg.senderName || msg.senderPhone}`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  async function sendReply(phoneNumber, outboundMsg) {
    try {
      await apiAdapter.sendMessage(phoneNumber, outboundMsg);
    } catch (err) {
      console.error(`WhatsApp reply failed for ${phoneNumber}:`, err.message);
    }
  }
}

function summarizeOutboundForTurn(reply) {
  // Short textual representation of the bot's outbound message for turn history.
  if (reply?.type === 'text') return (reply.body ?? '').slice(0, 300);
  if (reply?.type === 'buttons' || reply?.type === 'list') {
    return (reply.body ?? '').slice(0, 300);
  }
  return '';
}

function composeFallbackNarrative(draft) {
  const obs = draft?.structured_state?.observation ?? {};
  const parts = [];
  if (obs.behavior) parts.push(obs.behavior);
  if (obs.locality) parts.push(`מיקום: ${obs.locality}.`);
  if (obs.spread) parts.push(`היקף: ${obs.spread}.`);
  if (obs.sourceBasis) parts.push(`מקור: ${obs.sourceBasis}.`);
  if (parts.length === 0) {
    const officerLines = (draft?.turn_history ?? [])
      .filter((t) => t.role === 'officer')
      .map((t) => t.text)
      .filter(Boolean);
    return officerLines.join('\n') || 'דיווח ללא פרטים מוגדרים.';
  }
  return parts.join(' ');
}
