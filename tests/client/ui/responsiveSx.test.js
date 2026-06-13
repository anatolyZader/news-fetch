import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  scrollableTabRowSx,
  safeAreaFixedSx,
  stickyTableFirstColSx,
  mobileCardListSx,
} from '../../../client/src/ui/responsive/responsiveSx.js';

const mockTheme = {
  spacing: (n) => `${n * 8}px`,
  breakpoints: {
    down: (key) => `@media (max-width:${key === 'md' ? '899.95px' : '599.95px'})`,
    between: (_a, _b) => `@media (min-width:600px) and (max-width:899.95px)`,
  },
  palette: {
    background: { paper: '#fff' },
    divider: '#eee',
  },
};

describe('responsiveSx', () => {
  it('scrollableTabRowSx adds overflow on md down', () => {
    const sx = scrollableTabRowSx(mockTheme);
    assert.ok(sx['@media (max-width:899.95px)']);
    assert.equal(sx['@media (max-width:899.95px)'].overflowX, 'auto');
  });

  it('safeAreaFixedSx includes safe-area and inset on md down', () => {
    const sx = safeAreaFixedSx(mockTheme, { bottomInset: 48, position: 'bottom-right' });
    const mobile = sx['@media (max-width:899.95px)'];
    assert.match(mobile.bottom, /safe-area-inset-bottom/);
    assert.match(mobile.bottom, /48px/);
  });

  it('stickyTableFirstColSx targets sm–md range', () => {
    const sx = stickyTableFirstColSx(mockTheme);
    assert.ok(sx['@media (min-width:600px) and (max-width:899.95px)']);
  });

  it('mobileCardListSx is a column flex layout', () => {
    const sx = mobileCardListSx(mockTheme);
    assert.equal(sx.flexDirection, 'column');
  });
});
