import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDigestRecipientRows } from '../../../client/src/lib/digestRecipientRows.js';

describe('buildDigestRecipientRows', () => {
  it('prepends a read-only row for your address when it is not on the list', () => {
    const rows = buildDigestRecipientRows({
      storedRecipients: [{ email: 'colleague@example.com' }],
      selfEmail: 'boss@srulik.ai',
    });

    assert.deepEqual(rows, [
      { email: 'boss@srulik.ai', isSelf: true, removable: false },
      { email: 'colleague@example.com', isSelf: false, removable: true },
    ]);
  });

  it('marks your address once, and keeps it removable, when it is a stored row', () => {
    const rows = buildDigestRecipientRows({
      storedRecipients: [{ email: 'colleague@example.com' }, { email: 'boss@srulik.ai' }],
      selfEmail: 'boss@srulik.ai',
    });

    assert.equal(rows.length, 2, 'no synthetic duplicate');
    const self = rows.filter((r) => r.isSelf);
    assert.equal(self.length, 1);
    assert.deepEqual(self[0], { email: 'boss@srulik.ai', isSelf: true, removable: true });
  });

  it('matches your address despite case and whitespace differences', () => {
    const rows = buildDigestRecipientRows({
      storedRecipients: [{ email: '  Boss@Srulik.AI ' }],
      selfEmail: 'boss@srulik.ai',
    });

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { email: 'boss@srulik.ai', isSelf: true, removable: true });
  });

  it('adds no synthetic row when there is no self address', () => {
    for (const selfEmail of ['', '   ', null, undefined]) {
      const rows = buildDigestRecipientRows({
        storedRecipients: [{ email: 'colleague@example.com' }],
        selfEmail,
      });
      assert.deepEqual(rows, [{ email: 'colleague@example.com', isSelf: false, removable: true }]);
    }
  });

  it('preserves the stored order after the self row', () => {
    const rows = buildDigestRecipientRows({
      storedRecipients: [{ email: 'c@example.com' }, { email: 'a@example.com' }, { email: 'b@example.com' }],
      selfEmail: 'boss@srulik.ai',
    });

    assert.deepEqual(rows.map((r) => r.email), [
      'boss@srulik.ai', 'c@example.com', 'a@example.com', 'b@example.com',
    ]);
  });

  it('handles an empty or missing list', () => {
    assert.deepEqual(buildDigestRecipientRows(), []);
    assert.deepEqual(buildDigestRecipientRows({ storedRecipients: [], selfEmail: '' }), []);
    assert.deepEqual(
      buildDigestRecipientRows({ selfEmail: 'boss@srulik.ai' }),
      [{ email: 'boss@srulik.ai', isSelf: true, removable: false }],
    );
  });

  it('skips malformed entries rather than rendering blank rows', () => {
    const rows = buildDigestRecipientRows({
      storedRecipients: [{ email: '' }, {}, null, { email: '  ' }, { email: 'ok@example.com' }],
      selfEmail: '',
    });
    assert.deepEqual(rows, [{ email: 'ok@example.com', isSelf: false, removable: true }]);
  });
});
