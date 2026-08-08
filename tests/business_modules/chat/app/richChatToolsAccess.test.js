import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createChatToolContext, requireRichTools } from '../../../../business_modules/chat/app/createChatToolContext.js';
import { executePendingAction } from '../../../../business_modules/chat/app/executePendingAction.js';
import {
  setUserAccessConfigForTests,
  resetUserAccessCache,
} from '../../../../cross-cut-modules/auth/userAccess.js';

describe('rich chat tools open to all listed users', () => {
  beforeEach(() => {
    resetUserAccessCache();
    setUserAccessConfigForTests({
      userDistrictEnforcementEnabled: false,
      users: [
        { email: 'colleague@example.com', level: 'user' },
        { email: 'developer@example.com', level: 'developer' },
      ],
    });
  });

  afterEach(() => {
    resetUserAccessCache();
  });

  it('listed user gets the extended tool list', () => {
    const ctx = createChatToolContext({ userEmail: 'colleague@example.com' });
    assert.equal(ctx.richTools, true);
    const names = ctx.tools.map((t) => t.name);
    assert.ok(names.includes('list_observations'));
    assert.ok(names.includes('get_pbo_review'));
  });

  it('unlisted / anonymous user gets core tools only', () => {
    const ctx = createChatToolContext({ userEmail: 'stranger@example.com' });
    assert.equal(ctx.richTools, false);
    const names = ctx.tools.map((t) => t.name);
    assert.ok(!names.includes('list_observations'));
    assert.match(requireRichTools(ctx, 'list_observations'), /listed account/i);
  });

  it('listed user may confirm non-user propose actions', async () => {
    let called = null;
    const pending = {
      toolName: 'propose_geo_unknown_update',
      params: { id: 7, status: 'resolved' },
    };
    const ctx = {
      userEmail: 'colleague@example.com',
      geoUnknownReviewService: {
        updateStatus(id, patch) { called = { id, status: patch.status }; },
      },
    };
    const result = await executePendingAction(pending, ctx);
    assert.equal(result.ok, true);
    assert.deepEqual(called, { id: 7, status: 'resolved' });
  });

  it('unlisted user still cannot confirm non-user propose actions', async () => {
    const pending = { toolName: 'propose_geo_unknown_update', params: { id: 7, status: 'resolved' } };
    await assert.rejects(
      executePendingAction(pending, { userEmail: 'stranger@example.com' }),
      /Listed account required/,
    );
  });
});
