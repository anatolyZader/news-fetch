---
allowed-tools: Bash(node business_modules/resilience_scorer/input/run-cross-report-critique.js *), Bash(cd /home/eventstorm1/news && *), Bash(node -e *), Bash(ls *), Read, Write, Workflow
description: Cross-report critique — find recurring weak/unsupported claims across the last N resilience reports (no external API credits; judging fans out to up to 12 Claude subagents)
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

**Step 3 — Judge, don't just relay (fan out)**

The deterministic pass finds *structural* weakness. Your job is to say which findings are real analytical defects and which are artifacts.

Findings are independent: judging `recurring_weak_claims[3]` never needs the verdict on `[2]`. Reading them one after another in this context is a chain with no real edges, and it does the judging in the same context that just read the whole artifact — so every verdict is coloured by the summary you already formed. Fan out instead.

Call the **Workflow** tool with one judge per finding. Rules:

- **Cap 12 judges.** Take the top findings by `recurrence`, tie-broken by number of `persistent_weaknesses`. If more than 12 findings exist, say so explicitly in the report — a silent cap reads as full coverage.
- **Each judge gets one finding and nothing else** — its `exemplar_text`, `component_id`, `recurrence`, `persistent_weaknesses`, `verbatim_repeat`, `dates`, `sources`, `members`, plus the run's `caveats`. Never pass your own reading of the artifact, and never pass the other findings. A judge that inherits your summary is confirming it, not checking it.
- **Each judge opens the underlying evidence.** Give it the report paths from `members` and tell it to check whether the cited refs resolve to what the claim asserts. Verdict on the artifact alone is worth much less than verdict against the report — that is the anchor, and it is the reason this is worth spawning agents for at all.
- **Judges return structured verdicts**, one object each:

```
{ finding_index, verdict: "unsupported" | "thin_fair" | "artifact",
  confidence: "high" | "medium" | "low",
  rationale: "one or two sentences, citing what it checked",
  responsible_stage: "<file or pipeline stage>"   // artifact verdicts only
}
```

- **A judge that returns nothing is a gap, not a pass.** Count returned verdicts against judges spawned and list any finding that came back empty as unjudged in the report — never fold it into the counts as if it had been checked.

Do the cross-finding pattern work (below) yourself after the fan-out, on the returned verdicts. That part genuinely needs all of them at once — the fan-out is only for the per-finding call.

Use the classification rules below as the judge instructions, verbatim:

- **✗ Unsupported** — the claim asserts more than its evidence carries. Check `persistent_weaknesses`: `unknown_type_ref` means the claim cites a signal type the report never produced; `unresolved_ref` with a high `misattributed` count (see the weakness `detail` text) means the claim points at a real article but a type never extracted from it — a mis-attribution, not a missing file.
- **~ Thin but fair** — supported, just narrow (`single_article` / `single_source` / `single_channel`). Common and often unavoidable for PBO and visits material, where one municipality *is* one source. Say so rather than counting it as a defect.
- **⚑ Artifact** — the finding is about tooling, not analysis. Ref-key drift between narrative build and report serialization, `external_ref` pointing into the open-observation bundle the report only summarizes, boilerplate PBO score lines (`[municipality] component: avg=NN% (…)`) that recur because the template recurs. Name these separately; fixing them is a code change, not an analysis change.

**Step 3b — Read across the returned verdicts (you, not a judge)**

Once the fan-out returns, look across the verdicts for the patterns that matter. This is the reduce step and it genuinely needs every verdict at once:

- Which **component** carries the most unsupported claims, and does its `unsupported_claim_share` hold across reports or spike on particular dates?
- Which **signal types** and **sources** dominate `signal_type_weakness` / `source_weakness` — is one extraction rule generating most of the untraceable claims?
- Do the recurring claims cluster on one **municipality or channel**, i.e. is a single input template driving the repetition?
- Are claims recurring **verbatim** across dates (`verbatim_repeat: true`) where the underlying situation changed? A claim that never varies while the field does is a template, not an observation.

**Step 4 — Write the critique file**

Write to `business_modules/resilience_scorer/data/critiques/critique-<scope>-<from>-to-<to>.md` (same base name as the JSON artifact). Structure:

```markdown
# Cross-Report Critique: <scope> <from> → <to>
Reports: N (M with no claims) | Claims: N | Unsupported: N | Thin only: N
Judged: N of M findings (K over the cap, J returned nothing)

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

After writing, report the file path and the top 2–3 proposals as a summary. Be explicit about which findings were judged artifacts — that judgement is the value of this pass, and hiding it makes the next run repeat the work. Name any finding that was capped out or came back unjudged; an unchecked finding is not a clean one.
