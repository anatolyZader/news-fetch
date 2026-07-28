---
allowed-tools: Bash(node scripts/catalog-harvest/*), Bash(cd /home/eventstorm1/news && *), Bash(find *), Bash(ls *), Bash(grep *), Read, Write, Grep, Glob, Task
description: Harvest new signal-catalog candidates from pipeline residue + research literature into an operator review batch (NO catalog writes)
argument-hint: "[--no-literature] [--residue-only] [--max-papers N]"
---

## Your task

Run the catalog-harvest pipeline (Stages 0–4): mine empirical gaps from the pipeline's own OOV captures, optionally harvest research literature, extract schema-complete candidate signal types, dedup them against the live catalog, gate on extractability against the real article corpus, and write an **operator-revisable review batch**. **Never edit signalCatalog.js or signalRouting.js in this command** — landing happens only via `/apply-signal-batch` after operator approval.

Arguments: `$ARGUMENTS` — `--no-literature` / `--residue-only` skips Stage 1 (OOV residue only); `--max-papers N` caps literature corpus (default 30).

Workdir for this run: `business_modules/resilience_scorer/data/catalog_harvest/<YYYY-MM-DD>/` (today's date). All stage outputs go there.

**Stage 0 — mine pipeline residue**

```bash
node scripts/catalog-harvest/mine-oov-residue.mjs --out business_modules/resilience_scorer/data/catalog_harvest/<date>/stage0-residue.json
node scripts/catalog-harvest/dump-catalog-snapshot.mjs --out business_modules/resilience_scorer/data/catalog_harvest/<date>/catalog-snapshot.json
node scripts/catalog-harvest/dump-catalog-snapshot.mjs --compact --out business_modules/resilience_scorer/data/catalog_harvest/<date>/catalog-snapshot-compact.json
```

Read the residue summary. Note `candidate_types_new` (suggested types the extraction LLM already tried to emit) — these are the empirically strongest candidates and every one already carries real evidence.

**Stage 1 — literature corpus** (skip if `--no-literature`/`--residue-only`)

```bash
node scripts/catalog-harvest/fetch-literature.mjs --max <N or 30> --out business_modules/resilience_scorer/data/catalog_harvest/<date>/corpus.json
```

Free keyless APIs (OpenAlex); only the Claude-token meter applies downstream. Corpus entries are slim (title + abstract ≤1800 chars) by design — do NOT fetch full PDFs.

**Stage 2 — candidate extraction (agent fan-out)**

Spawn subagents in parallel (all in one message). Budget: ≤8 agents total.

- **Residue agents (1–2):** give them the top ~40 `candidate_types` entries with `already_in_catalog: false` from stage0-residue.json (plus `residual_observations`), split in half if >20.
- **Literature agents:** chunk corpus.json into groups of ~6 papers, one agent per chunk (cap so total agents ≤8; if the corpus is larger, prefer the highest `relevance_score` papers and note what was dropped).

Every agent prompt MUST contain:
1. The compact catalog vocabulary (paste the `types` array from catalog-snapshot-compact.json) + the `domains` and `construct_roles` maps.
2. This candidate schema (one JSON object per candidate):
```json
{
  "proposed_type": "snake_case_id",
  "label": "extraction definition sentence — what an LLM should look for in news/radio/social text",
  "domain": "<one of the 18 domain keys>",
  "signal_class": "behavior|attitude|structural_state|narrative|event|capacity",
  "defaultPolarity": "positive|negative",
  "construct_role": "pressure|capacity|response|population_state|institutional_state|outcome|narrative_frame",
  "mirror_candidate": "<existing or proposed opposite-polarity twin, or null>",
  "nearest_existing_types": ["2-3 closest catalog types"],
  "boundary_rationale": "one sentence per nearest type: why this candidate is NOT that type",
  "disambiguation": { "not_confused_with": ["<nearest types>"], "accept_patterns": ["evidence that IS this type"], "reject_patterns": ["evidence that is NOT (belongs to a neighbor)"] },
  "example_evidence": ["1-2 realistic evidence spans (Hebrew or English)"],
  "routing_proposal": { "<component_id>": { "polarity": "+|-", "role": "primary|inferred" } },
  "origin": { "kind": "oov|literature", "source": "<paper title / oov suggested_type>", "evidence_refs": ["..."] }
}
```
3. Hard rules: `nearest_existing_types` + `boundary_rationale` vs the 2–3 nearest existing types are MANDATORY (a candidate that cannot articulate its boundary is not a candidate); `disambiguation` must use the catalog's real shape (`not_confused_with`/`accept_patterns`/`reject_patterns` string arrays — see the typedef in signalCatalog.js); routing must have ≥1 primary edge using only these component ids: narrative, information_communication, lifesaving_behavior, functional_continuity, community_capital, leadership, belonging_solidarity, wellbeing_at_risk; response/capacity construct_roles must NOT route positively into wellbeing_at_risk; prefer NO candidate over a stretched one. Literature agents: only propose types that could plausibly fire in Israeli homefront news/radio/social-media text — survey-instrument items that need questionnaires (not observable in media text) must be skipped.

Agents return raw JSON arrays. Collect into `candidates-raw.json` in the workdir.

**Stage 3 — dedup judge (inline, no agents)**

For EACH raw candidate, compare against the full catalog snapshot (use the full, not compact, snapshot for the candidate's domain + its named nearest types). Verdicts:
- `duplicate` — an existing type already covers it → drop, but record the mapping.
- `merge` — existing type covers the phenomenon but the candidate's boundary/evidence would improve the existing entry → convert into a `merge_improvements` item (proposed addition to that entry's `disambiguation` or `example_evidence`).
- `new` — genuinely uncovered phenomenon → survives to Stage 4.

Expect most literature candidates to collapse to duplicate/merge — that is success, not failure. Also dedupe survivors against each other (agents may propose overlapping types; merge them, keeping the best-evidenced formulation).

**Stage 4 — extractability gate**

For each `new` survivor, hunt for real firings in the on-disk corpus:
- News articles: `business_modules/news-sites/articles_extracted/articles-homefront-*.md` (grep Hebrew + English keywords derived from the candidate's label/evidence).
- Extraction traces (raw_text ↔ signals pairs): `logs/traces/extract-news-*.jsonl`.
- Social: `business_modules/social_media/data/` and signals files in `business_modules/resilience_scorer/data/signals/`.

Rule: **≥2 distinct real articles/posts with concrete quotes → `pass`; otherwise `parked`** (kept in the batch with status `parked`, not deleted — theory-only candidates wait for evidence). OOV-origin candidates already carry captured evidence; count each distinct captured evidence span as one firing and still search for more. Record every firing as `{source_file, article_or_index, quote}`.

**Stage 5 output — the review batch (this command's deliverable)**

Write `business_modules/resilience_scorer/data/catalog_harvest/<date>/harvest-batch-<date>.json`:

```json
{
  "batch_id": "harvest-<date>",
  "created_at": "<ISO>",
  "catalog_version_at_harvest": "<from snapshot>",
  "summary": { "raw_candidates": 0, "duplicates": 0, "merges": 0, "new_passed": 0, "new_parked": 0 },
  "candidates": [
    {
      "id": "cand-001",
      "status": "proposed",
      "proposal": { "type": "...", "label": "...", "domain": "...", "signal_class": "...", "defaultPolarity": "...", "construct_role": "...", "mirror": null, "related": [], "disambiguation": {}, "example_evidence": [] },
      "routing_proposal": { "<component_id>": { "polarity": "+", "role": "primary" } },
      "origin": { "kind": "oov|literature", "source": "...", "refs": [] },
      "dedup": { "verdict": "new", "nearest": ["type_a", "type_b"], "reasoning": "one sentence" },
      "extractability": { "verdict": "pass|parked", "firings": [ { "source_file": "...", "ref": "...", "quote": "..." } ] }
    }
  ],
  "merge_improvements": [
    { "id": "merge-001", "status": "proposed", "target_type": "...", "field": "disambiguation|example_evidence|related", "proposed_value": "...", "origin": {}, "reasoning": "one sentence" }
  ],
  "dropped_duplicates": [ { "proposed_type": "...", "covered_by": "...", "origin_kind": "oov|literature" } ]
}
```

Also write `harvest-review-<date>.md` next to it — a human review sheet: one section per `pass` candidate (proposal table, firings with quotes, nearest types + why it's not them, proposed routing), then merge improvements, then a one-line-each parked list, then the duplicates table (suggested_type → covered_by; this doubles as an alias-worthiness list).

**Final report to operator**

- Batch + review file paths; the summary counts.
- Top 3–5 strongest candidates (one line each: type, origin, #firings).
- State explicitly: **nothing was written to the catalog**; to land, edit `status` fields in the batch JSON (`proposed` → `approved`/`rejected`; parked candidates can also be approved if the operator vouches) and run `/apply-signal-batch <date>`.
- Remind: landing bumps CATALOG_VERSION → new comparability epoch, so batch approvals rather than dribbling single types.

**Cost rules:** no full PDFs, no external paid APIs, ≤8 agents, agents receive compact snapshot + their chunk only (never whole corpus + whole residue together).
