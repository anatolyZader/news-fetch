---
allowed-tools: Bash(node -e *), Bash(find *), Bash(ls *), Read, Write
description: Review signal relevance and propose extraction improvements for a completed resilience report (no API credits — analysis runs inline)
---

## Your task

Audit the signal extraction quality of a completed resilience report JSON. No pipeline re-runs, no API calls. Do NOT ask for confirmation — just go.

**Step 1 — Resolve report path**
- If the user provided a file name or path, use it. Resolve relative names under `business_modules/resilience_scorer/data/reports/` (e.g. `north-3-230526-1545.json` → `business_modules/resilience_scorer/data/reports/north-3-230526-1545.json`; legacy `resilience-report-north-data-2026-05-23-run-*.json` still works).
- If no file specified, find the most recent report (must end in `.json`, not `.md` or `-brief.md`):
```
find /home/eventstorm1/news/business_modules/resilience_scorer/data/reports -name "*.json" ! -name "*-brief*" -type f | sort | tail -1
```

**Step 2 — Extract review data**

Run this node script from `/home/eventstorm1/news` (replace `<REPORT_PATH>` with the resolved path):

```
node -e "
const fs = require('fs');
const path = require('path');
const { SIGNAL_CATALOG, SIGNAL_TO_COMPONENTS } = require('./cross-cut-modules/resilience-contracts/signalCatalog.js');
const { RESILIENCE_COMPONENTS } = require('./cross-cut-modules/resilience-contracts/resilienceComponents.js');

const report = JSON.parse(fs.readFileSync('<REPORT_PATH>', 'utf8'));
const signals = report.signals || [];
const components = (report.assessment && report.assessment.components) || [];
const compDefs = Object.values(RESILIENCE_COMPONENTS);

function compDef(id) {
  const d = compDefs.find(c => c.id === id);
  return d ? { name: d.name_en, description: d.description.slice(0, 200), guiding_questions: d.guiding_questions } : null;
}

const signalAudit = signals.map(s => {
  const mapping = SIGNAL_TO_COMPONENTS[s.signal_type] || null;
  const catalogEntry = Object.values(SIGNAL_CATALOG).find(e => e.type === s.signal_type);
  return {
    signal_type: s.signal_type,
    evidence: (s.evidence || '').slice(0, 150),
    confidence: s.extraction_confidence,
    evidence_basis: s.evidence_basis,
    source_type: s.source_type,
    source: s.article_source,
    polarity: s.polarity_override,
    catalog_label: catalogEntry ? catalogEntry.label : null,
    catalog_in_registry: !!catalogEntry,
    component_mapping: mapping,
  };
});

const compSummary = components.map(c => ({
  id: c.component_id,
  score: c.score,
  confidence: c.confidence,
  signal_count: c.signal_count,
  evidence_mass: c.evidence_mass,
  certainty: Math.round((c.certainty || 0) * 100) / 100,
  def: compDef(c.component_id),
  top_contributors: (c.top_contributors || []).map(t => ({
    signal_type: t.signal_type,
    evidence: (t.evidence || '').slice(0, 150),
    contribution: Math.round(((t._contribution || t._contribution_raw || 0)) * 1000) / 1000,
    polarity: t._polarity,
    source: t.article_source,
    catalog_mapping: SIGNAL_TO_COMPONENTS[t.signal_type] || null,
  })),
}));

const sourceCounts = {};
signals.forEach(s => { sourceCounts[s.article_source] = (sourceCounts[s.article_source] || 0) + 1; });
const typeCounts = {};
signals.forEach(s => { typeCounts[s.signal_type] = (typeCounts[s.signal_type] || 0) + 1; });
const unregistered = signals.filter(s => !Object.values(SIGNAL_CATALOG).find(e => e.type === s.signal_type)).map(s => s.signal_type);

const out = {
  meta: {
    report: path.basename('<REPORT_PATH>'),
    date: report.assessment && report.assessment.date,
    scope: report.assessment && report.assessment.report_scope && report.assessment.report_scope.id,
    total_signals: signals.length,
    total_articles: report.assessment && report.assessment.total_articles_analyzed,
    source_breakdown: sourceCounts,
    signal_type_freq: Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0, 20),
    unregistered_signal_types: [...new Set(unregistered)],
  },
  signals: signalAudit,
  components: compSummary,
};
console.log(JSON.stringify(out, null, 2));
"
```

**Step 3 — Perform the review**

Analyze the JSON output. For each component do a structured assessment:
- **Relevance check**: for each top contributor, does the evidence text genuinely support this component's definition and guiding questions? Mark each: ✓ strong / ~ marginal / ✗ mismatched.
- **Catalog mapping check**: does the signal_type's canonical mapping (from `component_mapping`) include this component with a weight ≥ 0.5? If not, flag as "weak link."
- **Evidence basis check**: flag any contributor with `evidence_basis: inferred` or `confidence < 0.6` — these are the most likely noise sources.

Then look across all components for patterns:
- Any signal_type appearing ≥ 3× — is it being applied consistently or stretched?
- Any source dominating (≥ 25% of signals) — does its evidence tend to be strong or weak?
- Any component with `certainty < 0.25` — does the evidence actually justify even that low certainty, or is the signal count misleadingly inflated?
- Unregistered signal types (from `meta.unregistered_signal_types`) — what are they actually capturing?

**Step 3b — Spot-check queue (if present)**

Check `business_modules/resilience_scorer/data/spot_checks/spot-checks-<report-date>.jsonl` (the pipeline's stratified sample of the high-confidence extraction path). If the file exists, for each record with `status: "pending"` matching this report's scope: verify the `evidence` text genuinely supports the `signal_type` classification (use the catalog definitions already loaded in Step 2), and give a verdict per record: ✓ correct / ~ marginal / ✗ misclassified, with one line of reasoning. Include the verdicts in the review file under a `## Spot-Check Sample` section. Do NOT edit the JSONL file — it is an append-only queue; verdicts live in the review file.

**Step 4 — Write the review file**

Write to `business_modules/resilience_scorer/analyst/data/reviews/review-<report-slug>.md` (same base name as the report, prefix `review-`). Use this structure:

```markdown
# Signal Review: <report-slug>
Date: <report date> | Scope: <scope> | Signals: N | Articles: N

## Executive Summary
[3–5 sentences: overall extraction quality, main pattern found, most actionable finding]

## Per-Component Evidence Quality

### <Component Name> (score: N, certainty: N, signals: N)
| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| ... | ... | ✓/~/✗ | ... |

**Weak links:** [list signal_type/contributor pairs that don't belong]
**Gaps:** [types of evidence that are missing but would strengthen this component]

[repeat for all 8 components]

## Cross-Cutting Patterns
- **Over-used types:** [signal_type, how many times, concern]
- **Source concentration:** [source, %, quality assessment]
- **Low-certainty components:** [which ones, why the evidence is thin]
- **Unregistered types:** [what they are capturing, whether they belong in the catalog]

## Improvement Proposals
1. **[Title]** — [specific change to extraction prompt, signal_type definition, or source filter]. Expected impact: [which component(s) benefit].
2. ...
[3–6 proposals, ranked by estimated impact]
```

After writing, report the file path and the top 2–3 improvement proposals as a summary.
