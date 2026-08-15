import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGNAL_CATALOG,
} from '../../../../../business_modules/resilience_scorer/domain/contracts/signalCatalog.js';
import {
  formatDisambiguationBlock,
  formatSignalCatalog,
} from '../../../../../business_modules/resilience_scorer/domain/services/signals/routing/signalCatalogPrompt.js';

/**
 * The confusion pairs the 2026-04-02 spot-check sample kept failing. Every
 * error fell on one of two axes — provider vs recipient, and state/capability
 * vs act/effect — so each label must name the sibling it is confused with.
 *
 * Labels are the ONLY live channel here: construct_role is never rendered into
 * a prompt, and `disambiguation` on a non-priority type is never rendered
 * either. If a later edit drops the redirect, the boundary silently disappears.
 */
const REDIRECT_PAIRS = [
  ['wellbeing_support_accessed', 'wellbeing_support_provided'],
  ['wellbeing_support_provided', 'wellbeing_support_accessed'],
  ['community_volunteering', 'resource_mobilization'],
  ['resource_mobilization', 'community_volunteering'],
  ['information_clarity', 'information_actionable_effective'],
  ['information_actionable_effective', 'information_clarity'],
  ['inter_group_trust', 'solidarity_help_others'],
  ['solidarity_help_others', 'inter_group_trust'],
];

function labelOf(type) {
  const entry = Object.values(SIGNAL_CATALOG).find((e) => e.type === type);
  assert.ok(entry, `catalog should still define ${type}`);
  return entry.label ?? '';
}

describe('catalog labels — confusion-pair redirects', () => {
  for (const [type, sibling] of REDIRECT_PAIRS) {
    it(`${type} names ${sibling}`, () => {
      assert.match(labelOf(type), new RegExp(sibling));
    });
  }

  it('renders every redirect into the catalog block the extractor reads', () => {
    const catalog = formatSignalCatalog();
    for (const [type, sibling] of REDIRECT_PAIRS) {
      const line = catalog.split('\n').find((l) => l.includes(`\`${type}\``));
      assert.ok(line, `${type} should appear in the rendered catalog`);
      assert.ok(line.includes(sibling), `rendered ${type} line should redirect to ${sibling}`);
    }
  });

  it('keeps the redirects out of the hard-budgeted disambiguation block', () => {
    // The disambiguation block sits inside the 8100-char stable prefix, which
    // has single-digit headroom. These four types are not priority types, so
    // they must not have gained their own entries there.
    const block = formatDisambiguationBlock();
    for (const type of ['resource_mobilization', 'inter_group_trust']) {
      assert.ok(!block.includes(`\`${type}\`:`), `${type} must not own a disambiguation entry`);
    }
  });
});
