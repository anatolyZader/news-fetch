import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createPanelMessage,
  isTrustedPanelMessageOrigin,
  parsePanelMessage,
  PANEL_MESSAGE_TYPES,
} from '../../../client/src/lib/panelMessages.js';

describe('panelMessages', () => {
  it('createPanelMessage merges type and payload', () => {
    assert.deepEqual(
      createPanelMessage(PANEL_MESSAGE_TYPES.OPEN_DOCS, { slug: 'privacy' }),
      { type: PANEL_MESSAGE_TYPES.OPEN_DOCS, slug: 'privacy' },
    );
  });

  it('parsePanelMessage accepts typed objects only', () => {
    assert.deepEqual(parsePanelMessage({ type: 'open-docs' }), { type: 'open-docs' });
    assert.equal(parsePanelMessage(null), null);
    assert.equal(parsePanelMessage({}), null);
    assert.equal(parsePanelMessage('open-docs'), null);
  });

  it('isTrustedPanelMessageOrigin matches exact origin', () => {
    assert.equal(isTrustedPanelMessageOrigin('https://app.example', 'https://app.example'), true);
    assert.equal(isTrustedPanelMessageOrigin('https://evil.example', 'https://app.example'), false);
  });
});
