---
allowed-tools: Bash(node -e *), Bash(find *), Bash(ls *), Read, Write
description: Review signal relevance and propose extraction improvements for a completed resilience report (no API credits — analysis runs inline)
---

## Your task

Audit the signal extraction quality of a completed resilience report JSON. No pipeline re-runs, no API calls. Do NOT ask for confirmation — just go.

**Step 1 — Resolve report path**
- If the user provided a file name or path, use it. Resolve relative names under `business_modules/resilience_scorer/data/daily_reports/` (e.g. `north-1-data-2026-05-23-produced-2026-05-23T1545Z.json` → `business_modules/resilience_scorer/data/daily_reports/north-1-data-2026-05-23-produced-2026-05-23T1545Z.json`; legacy compact `north-3-230526-1545.json` and `resilience-report-north-data-…-run-*.json` still parse).
- If no file specified, find the most recent report (must end in `.json`, not `.md` or `-brief.md`):
```
find /home/eventstorm1/news/business_modules/resilience_scorer/data/daily_reports -name "*.json" ! -name "*-brief*" -type f | sort | tail -1
```

**Step 2 — Extract review data**

Run this node script from `/home/eventstorm1/news` (replace `<REPORT_PATH>` with the resolved path):

```
node -e "
const fs = require('fs');
const path = require('path');
const { SIGNAL_CATALOG } = require('./business_modules/resilience_scorer/domain/contracts/signalCatalog.js');
const { SIGNAL_TO_COMPONENTS } = require('./business_modules/resilience_scorer/domain/services/signals/routing/signalRouting.js');
const { RESILIENCE_COMPONENTS } = require('./business_modules/resilience_scorer/domain/contracts/resilienceComponents.js');

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
    confidence: s.confidence,
    grounding_tier: s.grounding_tier,
    grounding_reason: s.grounding_reason,
    evidence_type: s.evidence_type,
    evidence_basis: s.evidence_basis,
    scope_level: s.scope_level,
    source_type: s.source_type,
    source: s.article_source,
    polarity: s.polarity_override,
    catalog_label: catalogEntry ? catalogEntry.label : null,
    catalog_in_registry: !!catalogEntry,
    component_mapping: mapping,
  };
});

// min-math: components carry no score / certainty / evidence_mass. The evidence
// basis is where the real diagnostics live — most of what looks missing at the
// top level is already computed there.
const compSummary = components.map(c => ({
  id: c.component_id,
  confidence: c.confidence,
  signal_count: c.signal_count,
  distinct_article_count: c.distinct_article_count,
  source_diversity: c.source_diversity,
  coverage: c.coverage,
  assessment_state: c.assessment_state,
  presence_gate: c.presence_gate,
  evidence_basis: c.evidence_basis,
  def: compDef(c.component_id),
  top_contributors: (c.top_contributors || []).map(t => ({
    signal_type: t.signal_type,
    evidence: (t.evidence || '').slice(0, 150),
    evidence_type: t.evidence_type,
    confidence: t.confidence,
    grounding_tier: t.grounding_tier,
    grounding_reason: t.grounding_reason,
    polarity: t._polarity,
    source: t.article_source,
    catalog_mapping: SIGNAL_TO_COMPONENTS[t.signal_type] || null,
  })),
  demoted_evidence: c.demoted_evidence,
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
- **Catalog mapping check**: routing edges are `{polarity, role}`, not numeric weights. Does the signal_type's mapping give this component `role: "primary"`? An `inferred` edge is spillover from another component's evidence — flag as "weak link". Check `evidence_basis.inferred_context`: when inferred edges outnumber primary ones, and especially when they all share one polarity, the component reads better-evidenced and more one-directional than it is.
- **Verification check**: flag contributors with `confidence < 0.7`, and read `grounding_reason` — `embedding_rescue` is a weaker match than `containment`.
- **Demoted evidence**: read `demoted_evidence` per component. `signal_types` shows whether a whole class of evidence fell below the tier (a systemic extraction fault) rather than scattered rows. `grounding_reason: low_similarity` usually means the evidence could not be matched to its source — often a language or paraphrase problem — not that the claim is false. `critical_types_suppressed` names critical types that are being held back and deserve a look at the source.

Then look across all components for patterns:
- Any signal_type appearing ≥ 3× — is it being applied consistently or stretched?
- Source concentration: `evidence_basis.concentration_warning` is already computed per component (outlet > 60%, source_type > 70%). Also check the source *class* share by hand — one class can dominate completely while no single `article_source` trips the threshold.
- Any component whose `evidence_basis.sufficiency` is `thin` or `moderate`, or whose `balance` is `contested` / one-sided — does the evidence justify the reading?
- Where a component's `presence_gate` fired, is the gate's signal actually visible in `top_contributors`? A gate that fires on evidence the reader never sees is a surface bug.
- Unregistered signal types (from `meta.unregistered_signal_types`) — what are they actually capturing?

**Step 3b — Spot-check queue (if present)**

Check `business_modules/resilience_scorer/data/spot_checks/spot-checks-<report-date>.jsonl` (the pipeline's stratified sample of the high-confidence extraction path). If the file exists, for each record with `status: "pending"` matching this report's scope: verify the `evidence` text genuinely supports the `signal_type` classification (use the catalog definitions already loaded in Step 2), and give a verdict per record: ✓ correct / ~ marginal / ✗ misclassified, with one line of reasoning. Include the verdicts in the review file under a `## Spot-Check Sample` section. Do NOT edit the JSONL file — it is an append-only queue; verdicts live in the review file.

**Step 4 — Write the review file**

Write to `business_modules/resilience_scorer/developer/data/reviews/review-<report-slug>.md` (same base name as the report, prefix `review-`). Use this structure:

```markdown
# Signal Review: <report-slug>
Date: <report date> | Scope: <scope> | Signals: N | Articles: N

## Executive Summary
[3–5 sentences: overall extraction quality, main pattern found, most actionable finding]

## Per-Component Evidence Quality

### <Component Name> (confidence: N, signals: N, sufficiency: N, balance: N)
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
