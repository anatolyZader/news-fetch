import { describe, it } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import { registerSecurityPlugins } from '../../../cross-cut-modules/security/input/registerSecurityPlugins.js';

describe('registerSecurityPlugins security headers', () => {
  it('uses same-origin-allow-popups COOP so Firebase Google sign-in popup can complete', async () => {
    const app = Fastify();
    await registerSecurityPlugins(app);
    app.get('/', async () => 'ok');
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/' });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(
      res.headers['cross-origin-opener-policy'],
      'same-origin-allow-popups',
    );

    await app.close();
  });
});
