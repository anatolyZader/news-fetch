/**
 * Shared copy for the Components table — used by report markdown export and the web UI
 * so readers understand **Evidence level** vs **Component score**.
 */

/** Block inserted after `## Components` in reports and injected for legacy .md in the browser. */
export const COMPONENTS_TABLE_HELP_MARKDOWN = [
  '**What each column means**',
  '',
  '- **Assessment reliability** — How much we trust the **component score** (low / medium / high), based on both how strong the weighted evidence is and how broadly it appears across articles.',
  '- **Evidence level** — A **0–100% certainty** score: how much *weighted* behavioral evidence we found for this component. **It is not “how good resilience is.”** High % means we had enough signal strength to be confident in the scoring step; the **Component score** (1–10) tells you favorable vs unfavorable.',
  '- **Evidence base** — Number of behavioral signals tagged to this component.',
  '- **Article coverage** — How many *distinct* articles in today’s sample contributed at least one signal, as a fraction of all articles analyzed.',
  '',
  '**How Evidence level % is calculated (technical)** — Each signal adds `|mapping weight| × scope weight × reliability weight`. Those add up to *evidence mass*. Certainty = `1 − e^(−evidence_mass / 2)`, shown as %. It saturates toward 100% as mass grows. **Direction** (supporting vs opposing) is separate and shown under Evidence direction.',
].join('\n');

/** Short note repeated next to each Evidence level % in Detailed Analysis. */
export const EVIDENCE_LEVEL_INLINE_NOTE =
  'certainty % from weighted evidence mass—not the same as “good” or “bad” resilience; use Component score for direction';
