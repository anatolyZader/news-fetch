---
allowed-tools: Bash(node *), Bash(cd /home/eventstorm1/news && *), Bash(grep *), Bash(ls *), Read, Edit, Write, Grep, Glob
description: Land a user-approved harvest batch into signalCatalog.js + signalRouting.js (one batch = one CATALOG_VERSION bump = one epoch)
argument-hint: "<YYYY-MM-DD or batch path>"
---

## Your task

Land the **approved** items of a catalog-harvest batch into the live catalog. This is the ONLY command that writes to `signalCatalog.js` / `signalRouting.js`. One batch = one `CATALOG_VERSION` bump = one comparability epoch.

**Step 1 — resolve & preflight**

Resolve `$ARGUMENTS` to `business_modules/resilience_scorer/data/catalog_harvest/<date>/harvest-batch-<date>.json` (a full path is used as-is; bare date fills the template). Then:
- Collect items with `status: "approved"` (candidates AND merge_improvements). If none → report "nothing approved, nothing landed" and STOP.
- If any approved item has `status: "landed"` already, or the batch has `landed_at`, warn and ask the user before re-applying.
- Compare `catalog_version_at_harvest` to the current `CATALOG_VERSION` in `business_modules/resilience_scorer/domain/contracts/signalCatalog.js`. If they differ, the catalog moved since harvest: re-verify each approved candidate's `dedup.nearest` types still exist and no newer type already covers it; flag collisions to the user instead of landing them.
- Check batch-internal mirror integrity: if a candidate's `proposal.mirror` names another batch candidate that is NOT approved, either drop the mirror field (and say so) or hold both — never land a dangling mirror.

**Step 2 — edit signalCatalog.js** (`business_modules/resilience_scorer/domain/contracts/signalCatalog.js`)

For each approved candidate:
- Insert the entry into `SIGNAL_CATALOG` under its domain's comment section (entries are grouped by `// <Domain Label>`; append at the end of that domain's group). Field order convention: `type, construct_role, domain, signal_class, label, defaultPolarity, mirror?, related?, disambiguation?, example_evidence?`. `disambiguation` uses only `not_confused_with` / `accept_patterns` / `reject_patterns` string arrays.
- Mirrors are reciprocal by validator: if `mirror` names an **existing** type, also set `mirror: '<new_type>'` on that existing entry — and verify opposite `defaultPolarity`; if the existing entry already has a different mirror, do NOT steal it — drop the new mirror and note it in the report.
- `related` targets must exist (or be landed in this same batch).

For each approved merge_improvement: apply `proposed_value` to `target_type`'s entry field (append to arrays, don't replace, unless the item says replace). Remember: label/disambiguation/example_evidence changes alter the extraction prompt — that's expected; it's part of this epoch.

Finally bump `CATALOG_VERSION` one step (e.g. `'v8'` → `'v9'`) — once per batch, regardless of item count.

**Step 3 — edit signalRouting.js** (`business_modules/resilience_scorer/domain/services/signals/routing/signalRouting.js`)

For each new type, add its `routing_proposal` edges to `SIGNAL_TO_COMPONENTS` in **alphabetical position** (the map is alphabetically ordered). Rules the validator will enforce — fix proposals that violate them BEFORE landing, and note any change in the report:
- ≥1 `primary` edge; component ids only from: narrative, information_communication, lifesaving_behavior, functional_continuity, community_capital, leadership, belonging_solidarity, wellbeing_at_risk.
- Edge polarity should cohere with `defaultPolarity` (validator warns on sign mismatch).
- `response`/`capacity` construct_roles must not route `+` into wellbeing_at_risk.
- Mirror pairs need symmetric routing, or a documented exception in `MIRROR_ROUTING_ASYMMETRY`.

**Step 4 — validate & test**

```bash
cd /home/eventstorm1/news && node -e "import('./business_modules/resilience_scorer/domain/contracts/signalCatalog.js').then(async (c) => { c.assertValidSignalCatalog(); const r = await import('./business_modules/resilience_scorer/domain/services/signals/routing/signalRouting.js'); r.assertValidSignalRouting(); console.log('catalog + routing valid'); })"
cd /home/eventstorm1/news && node --test tests/business_modules/resilience_scorer/domain/services/signalCatalog.v5.test.js tests/business_modules/resilience_scorer/domain/services/signalCatalogPrompt.test.js tests/business_modules/resilience_scorer/domain/services/catalogMappingService.test.js tests/business_modules/resilience_scorer/domain/services/signalTypeHygiene.test.js
```

Expectation-only failures (the hardcoded `CATALOG_VERSION` string, type-count floors) are updated deliberately; semantic validator failures mean the batch item is wrong — pull that item back to `status: "proposed"`, revert its edits, and tell the user. Never weaken a validator to make a batch land.

**Step 5 — bookkeeping**

- In the batch JSON: set landed items to `status: "landed"`, add top-level `landed_at` (ISO) and `catalog_version_landed`.
- If a docs file tracks the catalog version (grep `docs/` for the previous version string), add/update the entry for the new version with a one-line list of added types.
- Do NOT `git commit` — repo convention is work-in-tree; the user commits.

**Final report**

- Types added (with domains), existing entries touched (mirror hookups, merge improvements), routing rows added, new `CATALOG_VERSION`.
- Test/validator results, verbatim failures if any.
- Explicit epoch warning: reports produced before vs. after this landing are **not comparable**; recommend a memory/changelog note in the style of the existing `project_scoring_epoch_*` records.
