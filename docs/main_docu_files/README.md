# Main documentation (`main_docu_files`)

Canonical, **overarching** reference documents for this repository. They are kept separate from working notes under `docs/reviews/`, `docs/specs/`, and other ad-hoc files in `docs/`.

## Files in this directory

| File | Role | Start here if… |
|------|------|----------------|
| [pipeline.md](./pipeline.md) | **Operational overview** — multi-source daily pipeline, source toggles, CLI commands, validation, social OSINT, trends tab, file map | You need to run or operate the daily pipeline |
| [8-component-analysis-end-to-end.md](./8-component-analysis-end-to-end.md) | **Implementation reference** — 8 components, ~165 signal types, scoring math, reliability instruments, UI reading guide, QA harness | You need to understand scoring, signals, or change resilience logic |
| [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) | **Geographic enrichment** — `geo` envelope, district scoping (national + five regional districts), reference data, matching pipeline | You work on locality resolution or regional filters |

### What each doc covers (current app state, 2026-05-28)

- **pipeline.md** — `extract-signals` + `assess-signals` daily pipeline, seven toggled source types in `pipeline-config.json` (including **social** X + Telegram), **pbo_regional** assess-time discovery, **PBO municipal completeness review** (daily step 7b), **WhatsApp DM adaptive chatbot** (group vs DM routing), validation collection, catalog learning gap reports, search trends UI, **News/Radio ingest review tabs**, **multi-district** `DistrictScopeSwitcher` (six scopes), analyst validation review in Report, desktop panel popups (chat, write report, send data, settings), `daily-pipeline.sh`, slash commands (`/8comp-3`, `/8comp-3-north`).
- **8-component-analysis-end-to-end.md** — Full framework depth: multipass extraction, verification, deterministic scoring, epistemic scope partition (including **text-inferred geo exclusion**), data void index, bootstrap/EWMA/polarization/chronic baseline, drift dashboard, narrative grounding, golden corpus, adversarial tests, OOV/learning capture, operator vs analyst display tiers, **ValidationReviewPanel**, full UI/API surface (including video/YouTube evidence and translation). Auto-synced component/facet tables from code.
- **GEOGRAPHIC-ANALYSIS.md** — `IGeoEnrichmentPort`, **v3 nested-only** envelope contract (`geo-envelope-2026-05-v3`), `resolution.provenance`, WhatsApp/survey/news geo attach, **`homefront-district-stubs.json`** for non-north districts, `scopeDecision` vs `geo.scopeDecision`, `regionSignalFilter` + **`collectionScope.json`** (no keyword fallback), unknown-locality review sinks.

Operator-facing instruments and feature flags are summarized in [`docs/MODEL-CARD.md`](../MODEL-CARD.md) (companion to the 8-component doc, not duplicated here).

## Auto-sync

Sections marked with `<!-- docs-sync:BEGIN … -->` / `<!-- docs-sync:END … -->` in **8-component-analysis-end-to-end.md** are regenerated from code (`resilienceComponents.js`, `componentFacets.js`, UI translations) on every CI run and via:

```bash
npm run docs:sync
```

Do not hand-edit content between those markers. Edit the source modules instead.

API reference pages under `docs/product_docs/api/generated/` are regenerated from `openapi/openapi.yaml` as part of the same sync. The spec includes **SocialMedia** (7 routes) and **SearchTrends** (3 routes) tags alongside existing modules.
