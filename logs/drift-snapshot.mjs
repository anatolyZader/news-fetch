// One-off: per-component pos/neg contribution mass on frozen signal fixtures.
// Usage: node logs/drift-snapshot.mjs <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { collectComponentItems } from '../business_modules/resilience_scorer/analyst/scoring/scoreSingleComponent.js';
import { buildDuplicateOccurrenceIndex } from '../business_modules/resilience_scorer/domain/epistemic/massContribution.js';
import { defaultSignalWeights } from '../business_modules/resilience_scorer/domain/services/signals/signalWeights.js';
import { COMPONENT_IDS } from '../business_modules/resilience_scorer/domain/contracts/componentIds.js';

const FIXTURES = [
  'business_modules/resilience_scorer/data/signals/signals-news-2026-04-05.json',
  'business_modules/resilience_scorer/data/signals/signals-news-2026-04-15.json',
  'business_modules/resilience_scorer/data/signals/signals-pbo-2026-04-12.json',
  'business_modules/resilience_scorer/data/signals/signals-pbo-2026-04-11.json',
];

const signals = FIXTURES.flatMap((p) => {
  const d = JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
  return Array.isArray(d) ? d : (d.signals ?? []);
});

const weights = defaultSignalWeights();
const dupIndex = buildDuplicateOccurrenceIndex(signals);
const out = { fixtureCount: signals.length, components: {} };
for (const id of COMPONENT_IDS) {
  const { items } = collectComponentItems(id, signals, dupIndex, weights);
  let pos = 0; let neg = 0;
  for (const it of items) {
    if (it.polarity === '+') pos += it.contribution; else neg += it.contribution;
  }
  out.components[id] = {
    items: items.length,
    pos: Math.round(pos * 1000) / 1000,
    neg: Math.round(neg * 1000) / 1000,
  };
}
writeFileSync(process.argv[2] ?? 'logs/catalog-drift-baseline.json', `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out.components, null, 1));
