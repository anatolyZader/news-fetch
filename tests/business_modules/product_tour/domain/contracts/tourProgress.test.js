import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAIN_SHELL_TOUR,
  normalizeProgress,
  filterStepsForTier,
  shouldAutoStart,
} from '../../../../../business_modules/product_tour/domain/contracts/index.js';

test('normalizeProgress coerces and clamps untrusted records', () => {
  assert.equal(normalizeProgress(null), null);
  assert.equal(normalizeProgress({ tourId: 'x', status: 'bogus' }), null);
  assert.equal(normalizeProgress({ tourId: '', status: 'completed' }), null);

  const p = normalizeProgress({
    tourId: 'main-shell',
    status: 'in_progress',
    lastStepIndex: 500,
    seenVersion: -3,
    completedAt: undefined,
  });
  assert.equal(p.lastStepIndex, 99);
  assert.equal(p.seenVersion, 1);
  assert.equal(p.completedAt, null);

  assert.equal(normalizeProgress({ tourId: 'main-shell', status: 'completed', lastStepIndex: 'NaN' }).lastStepIndex, 0);
});

test('filterStepsForTier keeps only the active tier', () => {
  const desktop = filterStepsForTier(MAIN_SHELL_TOUR.steps, { isDesktop: true });
  const mobile = filterStepsForTier(MAIN_SHELL_TOUR.steps, { isDesktop: false });
  assert.equal(desktop.length, MAIN_SHELL_TOUR.steps.length);
  assert.ok(mobile.length < desktop.length, 'desktop-only steps drop out on mobile');
  assert.ok(mobile.every((s) => s.tiers.includes('mobile')));
});

test('shouldAutoStart policy matrix', () => {
  const def = { version: MAIN_SHELL_TOUR.version };

  assert.deepEqual(shouldAutoStart(null, def), { start: true, resumeAt: 0 });

  const inProgress = normalizeProgress({
    tourId: 'main-shell', status: 'in_progress', lastStepIndex: 5, seenVersion: def.version,
  });
  assert.deepEqual(shouldAutoStart(inProgress, def), { start: true, resumeAt: 5 });

  const inProgressOldVersion = normalizeProgress({
    tourId: 'main-shell', status: 'in_progress', lastStepIndex: 5, seenVersion: def.version,
  });
  assert.deepEqual(
    shouldAutoStart(inProgressOldVersion, { version: def.version + 1 }),
    { start: true, resumeAt: 0 },
    'stale in_progress restarts from the top',
  );

  const completed = normalizeProgress({
    tourId: 'main-shell', status: 'completed', lastStepIndex: 9, seenVersion: def.version,
  });
  assert.deepEqual(shouldAutoStart(completed, def), { start: false, resumeAt: 0 });
  assert.deepEqual(
    shouldAutoStart(completed, { version: def.version + 1 }),
    { start: true, resumeAt: 0 },
    'completed at an older version is re-offered',
  );

  const dismissed = normalizeProgress({
    tourId: 'main-shell', status: 'dismissed', lastStepIndex: 2, seenVersion: def.version,
  });
  assert.deepEqual(shouldAutoStart(dismissed, def), { start: false, resumeAt: 0 });
  assert.deepEqual(
    shouldAutoStart(dismissed, { version: def.version + 1 }),
    { start: false, resumeAt: 0 },
    'dismissed is never re-offered, even after a version bump',
  );
});
