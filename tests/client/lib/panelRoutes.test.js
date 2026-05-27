import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isKnownPanelId,
  parsePanelPath,
  panelPathForId,
  PANEL_PATHS,
  buildChatPanelPath,
  parseChatReportScope,
} from '../../../client/src/lib/panelRoutes.js';

describe('panelRoutes', () => {
  it('parsePanelPath returns known panel ids', () => {
    assert.equal(parsePanelPath('/panel/report-build'), 'report-build');
    assert.equal(parsePanelPath('/panel/send-evidence'), 'send-evidence');
    assert.equal(parsePanelPath('/panel/settings'), 'settings');
    assert.equal(parsePanelPath('/panel/chat'), 'chat');
    assert.equal(parsePanelPath('/panel/report-build/'), 'report-build');
  });

  it('parsePanelPath returns null for unknown paths', () => {
    assert.equal(parsePanelPath('/panel/unknown'), null);
    assert.equal(parsePanelPath('/'), null);
    assert.equal(parsePanelPath('/panel'), null);
    assert.equal(parsePanelPath(''), null);
  });

  it('isKnownPanelId validates ids', () => {
    assert.equal(isKnownPanelId('report-build'), true);
    assert.equal(isKnownPanelId('settings'), true);
    assert.equal(isKnownPanelId('docs'), false);
  });

  it('panelPathForId maps ids to paths', () => {
    assert.equal(panelPathForId('report-build'), PANEL_PATHS['report-build']);
    assert.equal(panelPathForId('chat'), PANEL_PATHS.chat);
    assert.equal(panelPathForId('missing'), null);
  });

  it('buildChatPanelPath encodes report scope', () => {
    assert.equal(buildChatPanelPath({ type: 'all' }), '/panel/chat?scope=all');
    assert.equal(
      buildChatPanelPath({ type: 'component', id: 'narrative', label: 'Narrative' }),
      '/panel/chat?scope=component&id=narrative&label=Narrative',
    );
  });

  it('parseChatReportScope reads scope from search params', () => {
    assert.deepEqual(parseChatReportScope('?scope=all'), { type: 'all' });
    assert.deepEqual(parseChatReportScope('?scope=component&id=belonging_solidarity&label=Belonging'), {
      type: 'component',
      id: 'belonging_solidarity',
      label: 'Belonging',
    });
    assert.deepEqual(parseChatReportScope(''), { type: 'all' });
  });
});
