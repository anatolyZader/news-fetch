import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isKnownPanelId,
  parsePanelPath,
  panelPathForId,
  PANEL_PATHS,
  buildChatPanelPath,
  parseChatReportScope,
  buildDocsPanelPath,
  parseDocsSlug,
} from '../../../client/src/lib/panelRoutes.js';

describe('panelRoutes', () => {
  it('parsePanelPath returns known panel ids', () => {
    assert.equal(parsePanelPath('/panel/report-build'), 'report-build');
    assert.equal(parsePanelPath('/panel/send-evidence'), 'send-evidence');
    assert.equal(parsePanelPath('/panel/settings'), 'settings');
    assert.equal(parsePanelPath('/panel/chat'), 'chat');
    assert.equal(parsePanelPath('/panel/docs'), 'docs');
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
    assert.equal(isKnownPanelId('docs'), true);
    assert.equal(isKnownPanelId('missing'), false);
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
    assert.deepEqual(parseChatReportScope('?scope=all'), { type: 'all', reportGeoScope: 'national', initialMessage: null });
    assert.deepEqual(parseChatReportScope('?scope=component&id=belonging_solidarity&label=Belonging'), {
      type: 'component',
      id: 'belonging_solidarity',
      label: 'Belonging',
      reportGeoScope: 'national',
      initialMessage: null,
    });
    assert.deepEqual(parseChatReportScope(''), { type: 'all', reportGeoScope: 'national', initialMessage: null });
  });

  it('parseChatReportScope reads initialMessage from q param', () => {
    const parsed = parseChatReportScope('?scope=component&id=leadership&q=Tell%20me%20about%20Leadership');
    assert.equal(parsed.initialMessage, 'Tell me about Leadership');
  });

  it('buildDocsPanelPath encodes slug', () => {
    assert.equal(buildDocsPanelPath(''), '/panel/docs');
    assert.equal(buildDocsPanelPath('index'), '/panel/docs?slug=index');
    assert.equal(
      buildDocsPanelPath('getting-started/get-started'),
      '/panel/docs?slug=getting-started%2Fget-started',
    );
  });

  it('parseDocsSlug reads slug from search params', () => {
    assert.equal(parseDocsSlug(''), null);
    assert.equal(parseDocsSlug('?slug=index'), 'index');
    assert.equal(parseDocsSlug('?slug=getting-started/using-the-app'), 'getting-started/using-the-app');
  });
});
