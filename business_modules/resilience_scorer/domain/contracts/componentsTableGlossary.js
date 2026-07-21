/**
 * Components table glossary copy for report markdown and web UI.
 *
 * Pipeline position: report display — explains count-based evidence columns to
 * readers. Client-safe isomorphic (imported by React and markdown export).
 *
 * Owns: COMPONENTS_TABLE_HELP_MARKDOWN block and EVIDENCE_LEVEL_INLINE_NOTE.
 * Does NOT: compute sufficiency/balance bands (componentEvidence.js) or numeric
 * resilience scores (min-math).
 *
 * Key collaborators: componentEvidence.js, client ComponentsTable, report markdown export.
 */

/** Block inserted after `## Components` in reports and injected for legacy .md in the browser. */
export const COMPONENTS_TABLE_HELP_MARKDOWN = [
  '**What each column means**',
  '',
  '- **Assessment reliability** — How much to trust this component’s assessment (low / medium / high), derived from how much evidence was found and how broadly it appears across articles and source types.',
  '- **Evidence base** — Number of verified behavioral signals tagged to this component.',
  '- **Sufficiency** — Evidence-volume band (none / thin / moderate / adequate) from signal count, distinct articles, and source-type diversity. **It is not “how good resilience is”** — it says how much ground the narrative stands on.',
  '- **Balance** — Whether supporting and opposing observations point one way (supporting only / opposing only), lean one way (mixed), or are split (**contested** — the narrative must describe the disagreement, not resolve it).',
  '- **Article coverage** — How many *distinct* articles in today’s sample contributed at least one signal, as a fraction of all articles analyzed.',
  '',
  '**Direction and degree live in the narrative** — each component’s prose cites its evidence; critical flags (presence gate, critical single signal) surface verified failure modes regardless of overall balance.',
].join('\n');

/** Short note repeated next to the evidence line in Detailed Analysis. */
export const EVIDENCE_LEVEL_INLINE_NOTE =
  'sufficiency and balance come from signal counts and source diversity — not a resilience rating; read the narrative for direction';
