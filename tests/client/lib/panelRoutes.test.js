import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  isKnownPanelId,
  parsePanelPath,
  panelPathForId,
  PANEL_PATHS,
} from '../../../client/src/lib/panelRoutes.js';

describe('panelRoutes', () => {
  it('parsePanelPath returns known panel ids', () => {
    assert.equal(parsePanelPath('/panel/report-build'), 'report-build');
    assert.equal(parsePanelPath('/panel/send-evidence'), 'send-evidence');
    assert.equal(parsePanelPath('/panel/settings'), 'settings');
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
    assert.equal(panelPathForId('missing'), null);
  });
});
