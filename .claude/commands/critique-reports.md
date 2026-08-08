---
allowed-tools: Bash(node business_modules/resilience_scorer/input/run-cross-report-critique.js *), Bash(cd /home/eventstorm1/news && *), Bash(node -e *), Bash(ls *), Read, Write
description: Cross-report critique — find recurring weak/unsupported claims across the last N resilience reports (no API credits — analysis runs inline)
---

## Your task

Find the claims this pipeline keeps making that its own evidence does not carry. One thin claim is noise; the same thin claim across several reports is a defect worth fixing. Read-only over reports. No pipeline re-runs, no API calls. Do NOT ask for confirmation — just go.

This is the cross-report complement to `/review-signals` (single report, signal→component relevance). Use that one to audit extraction quality for one report; use this one to find systematic narrative defects over time.

**Step 1 — Run the deterministic pass**

Arguments the user may pass: a scope (`north`, `national`, …) and/or a report count. Defaults: all scopes, last 8 reports.

```
node business_modules/resilience_scorer/input/run-cross-report-critique.js --scope <scope> --limit <n>
```

Useful flags: `--min-recurrence <n>` (default 2 — how many reports a claim must appear in), `--similarity <0-1>` (default 0.7 — token overlap for "same claim"), `--min-confidence`, `--min-grounding`.

The run writes `business_modules/resilience_scorer/data/critiques/critique-<scope>-<from>-to-<to>.json` and prints a summary. Note the artifact path — the next step reads it.

**Step 2 — Read the artifact**

Read the JSON. Its shape:

- `caveats` — report-level conditions that invalidate a naive reading. **Honor these.** `grounding_not_computed` means `narrative_grounding_score` is 0 because the narrative pipeline degraded, not because prose was ungrounded — never report those zeros as a grounding failure.
- `totals` — `unsupported_claims` / `thin_only_claims` / `clean_claims`, plus `reports_without_claims` (reports contributing nothing, which quietly shrink the sample).
- `weakness_frequency` — claim-level weakness counts. Tiers: `unsupported` (`no_refs`, `unknown_type_ref`, `unresolved_ref`, `inferred_support`, `ungrounded_support`) and `thin` (`single_article`, `single_source`, `single_channel`, `low_confidence_support`, `external_ref`).
- `context_frequency` — component-level conditions (`low_grounding_component`, `interpretive_component`, `concentrated_component`). These apply to every claim in a component at once — treat them as backdrop, not as per-claim verdicts.
- `recurring_weak_claims` — the findings, ranked. Each carries `exemplar_text`, `component_id`, `recurrence` (distinct reports), `persistent_weaknesses` (weaknesses present in *every* occurrence), `verbatim_repeat`, `dates`, `sources`, and `members` with per-report detail.
- `component_findings` — chronic weakness per component. `graded_reports` is the denominator for grounding columns; when it is 0, grounding never ran and those columns mean nothing.
- `signal_type_weakness` / `source_weakness` — which signal types and sources carry the weak claims.

**Step 3 — Judge, don't just relay**

The deterministic pass finds *structural* weakness. Your job is to say which findings are real analytical defects and which are artifacts. Work through `recurring_weak_claims` and classify each:

- **✗ Unsupported** — the claim asserts more than its evidence carries. Check `persistent_weaknesses`: `unknown_type_ref` means the claim cites a signal type the report never produced; `unresolved_ref` with a high `misattributed` count (see the weakness `detail` text) means the claim points at a real article but a type never extracted from it — a mis-attribution, not a missing file.
- **~ Thin but fair** — supported, just narrow (`single_article` / `single_source` / `single_channel`). Common and often unavoidable for PBO and visits material, where one municipality *is* one source. Say so rather than counting it as a defect.
- **⚑ Artifact** — the finding is about tooling, not analysis. Ref-key drift between narrative build and report serialization, `external_ref` pointing into the open-observation bundle the report only summarizes, boilerplate PBO score lines (`[municipality] component: avg=NN% (…)`) that recur because the template recurs. Name these separately; fixing them is a code change, not an analysis change.

Then look across findings for the patterns that matter:

- Which **component** carries the most unsupported claims, and does its `unsupported_claim_share` hold across reports or spike on particular dates?
- Which **signal types** and **sources** dominate `signal_type_weakness` / `source_weakness` — is one extraction rule generating most of the untraceable claims?
- Do the recurring claims cluster on one **municipality or channel**, i.e. is a single input template driving the repetition?
- Are claims recurring **verbatim** across dates (`verbatim_repeat: true`) where the underlying situation changed? A claim that never varies while the field does is a template, not an observation.

**Step 4 — Write the critique file**

Write to `business_modules/resilience_scorer/data/critiques/critique-<scope>-<from>-to-<to>.md` (same base name as the JSON artifact). Structure:

```markdown
# Cross-Report Critique: <scope> <from> → <to>
Reports: N (M with no claims) | Claims: N | Unsupported: N | Thin only: N

## Executive Summary
[3–5 sentences: the dominant recurring defect, whether it is analytical or tooling, and the single highest-leverage fix]

## Caveats
[Anything from `caveats`, in plain terms — what cannot be concluded from this run and why]

## Recurring Unsupported Claims
| Claim (exemplar) | Component | Reports | Persistent weakness | Verdict | Note |
|---|---|---|---|---|---|
| ... | ... | 4 | unresolved_ref | ✗ | ... |

## Thin But Fair
[Claims flagged only for single-source/single-article support where that is structurally expected — listed so they are not re-litigated next run]

## Tooling Artifacts
[Findings that are code defects, not analysis defects, each with the file or stage responsible]

## Chronic Components
[From `component_findings`: which components are persistently weak, with the numbers, respecting `graded_reports`]

## Improvement Proposals
1. **[Title]** — [specific change to extraction prompt, claim construction, ref registry, or source handling]. Evidence: [which finding(s)]. Expected impact: [what stops recurring].
2. ...
[3–6 proposals, ranked by estimated impact, each traceable to a finding above]
```

After writing, report the file path and the top 2–3 proposals as a summary. Be explicit about which findings you judged artifacts — that judgement is the value of this pass, and hiding it makes the next run repeat the work.
