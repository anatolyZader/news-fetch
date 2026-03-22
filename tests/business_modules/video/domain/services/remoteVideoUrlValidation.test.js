import { describe, it } from 'node:test';
import assert from 'node:assert';

import { validateRemoteVideoUrl } from '../../../../../business_modules/video/domain/services/remoteVideoUrlValidation.js';

describe('validateRemoteVideoUrl', () => {
  it('accepts https YouTube watch URL', () => {
    const u = validateRemoteVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    assert.ok(u.startsWith('https://www.youtube.com/watch'));
  });

  it('accepts youtu.be short links', () => {
    const u = validateRemoteVideoUrl('https://youtu.be/dQw4w9WgXcQ');
    assert.strictEqual(u, 'https://youtu.be/dQw4w9WgXcQ');
  });

  it('rejects non-http(s)', () => {
    assert.throws(() => validateRemoteVideoUrl('ftp://example.com/a'), /only http and https/);
  });

  it('rejects file URLs', () => {
    assert.throws(() => validateRemoteVideoUrl('file:///etc/passwd'), /only http and https/);
  });

  it('rejects localhost', () => {
    assert.throws(() => validateRemoteVideoUrl('http://localhost/foo'), /not allowed/);
  });

  it('rejects private IPv4', () => {
    assert.throws(() => validateRemoteVideoUrl('http://192.168.1.1/x'), /not allowed/);
    assert.throws(() => validateRemoteVideoUrl('http://10.0.0.1/x'), /not allowed/);
  });

  it('rejects URLs with credentials', () => {
    assert.throws(() => validateRemoteVideoUrl('https://user:pass@youtube.com/x'), /credentials/);
  });

  it('rejects overlong strings', () => {
    assert.throws(() => validateRemoteVideoUrl('https://x.com/' + 'a'.repeat(3000)), /too long/);
  });
});
