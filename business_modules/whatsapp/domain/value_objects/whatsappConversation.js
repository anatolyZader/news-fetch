import { transition } from '../conversation/conversationStateMachine.js';

/**
 * Hydrates WhatsApp conversation state and delegates transitions to the pure state machine.
 */
export class WhatsAppConversation {
  /**
   * @param {{ phoneNumber: string, state: string, draftId?: string|null }} row
   */
  constructor(row) {
    this.phoneNumber = row.phoneNumber;
    this.state = row.state ?? 'idle';
    this.draftId = row.draftId ?? null;
  }

  /** @param {object|null} storeRow */
  static fromStoreRow(storeRow) {
    if (!storeRow) return new WhatsAppConversation({ phoneNumber: '', state: 'idle' });
    return new WhatsAppConversation({
      phoneNumber: storeRow.phone_number,
      state: storeRow.state,
      draftId: storeRow.draft_id,
    });
  }

  /**
   * @param {import('../conversation/inboundMessageNormalizer.js').NormalizedInbound} msg
   * @param {object|null} draft
   */
  applyMessage(msg, draft) {
    return transition(this.state, msg, draft);
  }
}
