import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractReviewTokenFromAddress,
  stripQuotedReply,
  parseInboundEmailPayload,
} from '../../../../../business_modules/pbo_report_review/domain/services/inboundEmailParser.js';

describe('inboundEmailParser', () => {
  it('extracts review token from plus-address', () => {
    assert.equal(
      extractReviewTokenFromAddress('pbo-review+abc123def@inbound.example.com'),
      'abc123def',
    );
  });

  it('strips quoted reply blocks', () => {
    const body = 'My answer here\n\nOn Thu, someone wrote:\n> old quote';
    assert.equal(stripQuotedReply(body), 'My answer here');
  });

  it('parses Resend-like inbound payload', () => {
    const parsed = parseInboundEmailPayload({
      data: {
        from: 'officer@example.org',
        to: ['pbo-review+tok999@inbound.example.com'],
        subject: 'Re: PBO',
        text: 'Supplemental info\n\n> quoted',
      },
    });
    assert.equal(parsed.reviewToken, 'tok999');
    assert.equal(parsed.text, 'Supplemental info');
  });
});
