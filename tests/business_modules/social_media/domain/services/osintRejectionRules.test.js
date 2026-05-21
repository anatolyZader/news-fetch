import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCitizenVoiceCandidate } from '../../../../../business_modules/social_media/domain/services/osintRejectionRules.js';

describe('osintRejectionRules', () => {
  it('rejects news-domain URLs', () => {
    const out = evaluateCitizenVoiceCandidate({
      url: 'https://www.ynet.co.il/news/article-1',
      quote_original: 'תושב אמר משהו חשוב מאוד על האזעקות',
      speaker_role: 'תושב',
      platform: 'facebook_public_group',
    });
    assert.equal(out.accepted, false);
    assert.equal(out.reason, 'news_domain');
  });

  it('accepts verified forum reply', () => {
    const out = evaluateCitizenVoiceCandidate({
      url: 'https://www.hasolidit.com/kehila/threads/example.36510/',
      quote_original: 'עבורי בנהריה, ממ"ד חשוב מאוד בגלל זמן ההתרעה.',
      speaker_role: 'תושב',
      platform: 'hebrew_forum_hasolidit',
    });
    assert.equal(out.accepted, true);
  });

  it('rejects missing quote', () => {
    const out = evaluateCitizenVoiceCandidate({
      url: 'https://example.com/post',
      quote_original: 'short',
      speaker_role: 'תושב',
      platform: 'x',
    });
    assert.equal(out.accepted, false);
    assert.equal(out.reason, 'no_citizen_quote');
  });
});
