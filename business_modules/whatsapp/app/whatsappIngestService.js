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
import { isDmPhoneAllowed } from '../../resilience/index.js';
import { buildAnalysisReply } from '../domain/services/hebrewResponseBuilder.js';
import { normalizeInboundMessage } from '../domain/conversation/inboundMessageNormalizer.js';
import { transition } from '../domain/conversation/conversationStateMachine.js';
import {
  buildExpiredSession, buildWelcomeMenu, buildFollowupQuestions, buildDraftPreview,
} from '../domain/conversation/outboundMessageFactory.js';
import { persistOriginalSources } from '../../../db/source_archive/persistOriginals.js';

const CONVERSATION_TTL_MINUTES = 60;

const DEFAULT_WHATSAPP_REPORT_DIR = 'business_modules/whatsapp/reports';
const DEFAULT_WHATSAPP_REPORT_BASENAME = 'whatsapp_reports';

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

  async function handleDmMessage(msg) {
    if (!isDmPhoneAllowed(msg.senderPhone)) {
      console.error(`  → [whatsapp] DM from ${msg.senderPhone} rejected (not in allowlist)`);
      return;
    }

    const normalized = normalizeInboundMessage(msg, msg.rawMessage);

    if (messageStore.hasMsgId(msg.metaMsgId)) return;

    const msgDate = new Date(Number(msg.timestamp) * 1000);
    const date = msgDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const timestampUtc = msgDate.toISOString();

    messageStore.insert({
      metaMsgId: msg.metaMsgId,
      groupJid: null,
      senderPhone: msg.senderPhone,
      senderName: msg.senderName,
      messageText: normalized.text ?? '',
      timestampUtc,
      date,
    });

    // Load conversation + expiry handling
    let conv = conversationStore.get(normalized.phoneNumber);
    let currentState = conv?.state ?? 'idle';

    if (conv && isExpired(conv.updated_at)) {
      if (conv.draft_id) {
        try { draftStore.deleteById(conv.draft_id); } catch { /* ok */ }
      }
      conversationStore.reset(normalized.phoneNumber);
      await sendReply(normalized.phoneNumber, buildExpiredSession());
      await sendReply(normalized.phoneNumber, buildWelcomeMenu());
      return;
    }

    let activeDraftId = conv?.draft_id ?? null;
    let draft = activeDraftId ? draftStore.get(activeDraftId) : null;

    // ── Step 1: run the pure state machine to route the message ─────────
    const result = transition(currentState, normalized, draft);

    // ── Step 2: apply side effects ──────────────────────────────────────
    let nextState = result.nextState;
    let forceSubmit = false;

    for (const effect of result.sideEffects) {
      switch (effect.type) {
        case 'create_draft': {
          activeDraftId = draftStore.create(normalized.phoneNumber);
          break;
        }
        case 'append_turn_officer': {
          if (activeDraftId) {
            draftStore.appendTurn(activeDraftId, {
              role: 'officer', text: effect.text, ts: timestampUtc,
            });
          }
          break;
        }
        case 'append_turn_bot': {
          if (activeDraftId) {
            draftStore.appendTurn(activeDraftId, {
              role: 'bot', text: effect.text, ts: new Date().toISOString(),
            });
          }
          break;
        }
        case 'run_extractor_loop': {
          const outcome = await runExtractorLoop({
            draftId: activeDraftId, normalized, timestampUtc,
          });
          nextState = outcome.nextState;
          for (const reply of outcome.replies) result.replies.push(reply);
          if (outcome.askDraftGenerator) {
            const generated = await runDraftGenerator({ draftId: activeDraftId });
            for (const reply of generated.replies) result.replies.push(reply);
            nextState = generated.nextState;
          }
          break;
        }
        case 'submit_draft': {
          if (activeDraftId) {
            await submitDraft(activeDraftId, normalized, date, timestampUtc);
            forceSubmit = true;
          }
          activeDraftId = null;
          break;
        }
        case 'delete_draft': {
          if (activeDraftId) {
            try { draftStore.deleteById(activeDraftId); } catch { /* ok */ }
          }
          activeDraftId = null;
          break;
        }
      }
    }

    // ── Step 3: persist conversation state ──────────────────────────────
    if (nextState === 'idle' || forceSubmit) {
      conversationStore.reset(normalized.phoneNumber);
    } else {
      conversationStore.upsert(normalized.phoneNumber, nextState, activeDraftId);
    }

    // ── Step 4: send replies (and record bot turns) ─────────────────────
    for (const reply of result.replies) {
      await sendReply(normalized.phoneNumber, reply);
      if (activeDraftId && reply?.body) {
        try {
          draftStore.appendTurn(activeDraftId, {
            role: 'bot', text: summarizeOutboundForTurn(reply), ts: new Date().toISOString(),
          });
        } catch { /* ok */ }
      }
    }

    console.error(
      `WhatsApp DM processed: ${msg.metaMsgId} from ${msg.senderPhone} [${currentState} → ${nextState}]`,
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

  function isExpired(updatedAt) {
    if (!updatedAt) return true;
    const updated = new Date(updatedAt + 'Z'); // SQLite datetime is UTC
    const now = new Date();
    return (now - updated) > CONVERSATION_TTL_MINUTES * 60 * 1000;
  }

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
