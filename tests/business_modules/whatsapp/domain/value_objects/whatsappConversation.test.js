import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppConversation } from '../../../../../business_modules/whatsapp/domain/value_objects/whatsappConversation.js';

describe('WhatsAppConversation VO', () => {
  it('hydrates from store row', () => {
    const conv = WhatsAppConversation.fromStoreRow({
      phone_number: '+123',
      state: 'collecting',
      draft_id: 'd1',
    });
    assert.equal(conv.state, 'collecting');
    assert.equal(conv.draftId, 'd1');
  });
});
