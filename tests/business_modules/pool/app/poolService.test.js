import test from 'node:test';
import assert from 'node:assert/strict';
import { createPoolService } from '../../../../business_modules/pool/app/poolService.js';

test('createPoolService delegates to ports', async () => {
  const educationSessionsPort = {
    async getDashboard(opts) {
      return { kind: 'edu', forceRefresh: Boolean(opts?.forceRefresh) };
    },
  };
  const naftaliDashboardPort = {
    async getDashboard(opts) {
      return { kind: 'naftali', forceRefresh: Boolean(opts?.forceRefresh) };
    },
  };
  const svc = createPoolService({ educationSessionsPort, naftaliDashboardPort });
  const edu = await svc.getEducationDashboard({ forceRefresh: true });
  const naf = await svc.getNaftaliDashboard({ forceRefresh: false });
  assert.equal(edu.kind, 'edu');
  assert.equal(edu.forceRefresh, true);
  assert.equal(naf.kind, 'naftali');
  assert.equal(naf.forceRefresh, false);
});

test('createPoolService requires valid ports when overridden', () => {
  assert.throws(() => createPoolService({ educationSessionsPort: {}, naftaliDashboardPort: {} }), /requires/);
});
