import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPopupFeatures,
  computePopupPosition,
  openPanelPopup,
  popupWindowName,
  reloadPopupIfBundleStale,
} from '../../../client/src/lib/panelPopup.js';

describe('panelPopup', () => {
  /** @type {Window | undefined} */
  let originalWindow;

  beforeEach(() => {
    originalWindow = globalThis.window;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it('popupWindowName is stable per panel', () => {
    assert.equal(popupWindowName('report-build'), 'vibes-witch-report-build');
  });

  it('buildPopupFeatures includes dimensions and popup flag', () => {
    const features = buildPopupFeatures(920, 680, 120, 80);
    assert.match(features, /popup=yes/);
    assert.match(features, /width=920/);
    assert.match(features, /height=680/);
    assert.match(features, /left=120/);
    assert.match(features, /top=80/);
  });

  it('computePopupPosition centers relative to opener window', () => {
    globalThis.window = {
      screenX: 200,
      screenY: 200,
      outerWidth: 1200,
    };
    assert.deepEqual(computePopupPosition(920, 680), { left: 340, top: 280 });
  });

  it('openPanelPopup refocuses an existing window', () => {
    let openCalls = 0;
    let reloaded = false;
    const existing = {
      closed: false,
      location: { pathname: '/panel/report-build', search: '', assign() {}, reload() { reloaded = true; } },
      document: {
        querySelector() {
          return { getAttribute: () => '/assets/index-old.js' };
        },
      },
      focus() {},
    };
    globalThis.document = {
      querySelector() {
        return { getAttribute: () => '/assets/index-new.js' };
      },
    };
    globalThis.window = {
      screenX: 0,
      outerWidth: 1000,
      open() {
        openCalls += 1;
        return null;
      },
    };
    const result = openPanelPopup('report-build', /** @type {Window} */ (existing));
    assert.equal(result, existing);
    assert.equal(openCalls, 0);
    assert.equal(reloaded, true);
  });

  it('reloadPopupIfBundleStale reloads when bundle hashes differ', () => {
    let reloaded = false;
    const popup = {
      document: {
        querySelector() {
          return { getAttribute: () => '/assets/index-a.js' };
        },
      },
      location: { reload() { reloaded = true; } },
    };
    globalThis.document = {
      querySelector() {
        return { getAttribute: () => '/assets/index-b.js' };
      },
    };
    reloadPopupIfBundleStale(/** @type {Window} */ (popup));
    assert.equal(reloaded, true);
  });

  it('openPanelPopup opens a new window with panel path', () => {
    let openedUrl = '';
    let openedName = '';
    let openedFeatures = '';
    globalThis.window = {
      screenX: 0,
      outerWidth: 1000,
      open(url, name, features) {
        openedUrl = url;
        openedName = name;
        openedFeatures = features;
        return { closed: false, focus() {} };
      },
    };
    const result = openPanelPopup('send-evidence', null);
    assert.ok(result);
    assert.equal(openedUrl, '/panel/send-evidence');
    assert.equal(openedName, 'vibes-witch-send-evidence');
    assert.match(openedFeatures, /width=920/);
  });

  it('openPanelPopup opens chat with encoded report scope', () => {
    let openedUrl = '';
    globalThis.window = {
      screenX: 0,
      outerWidth: 1000,
      open(url) {
        openedUrl = url;
        return { closed: false, focus() {} };
      },
    };
    openPanelPopup('chat', null, { reportScope: { type: 'component', id: 'narrative', label: 'Narrative' } });
    assert.equal(openedUrl, '/panel/chat?scope=component&id=narrative&label=Narrative');
  });
});
