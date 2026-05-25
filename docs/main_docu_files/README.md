# Main documentation (`main_docu_files`)

Canonical, **overarching** reference documents for this repository. They are kept separate from working notes under `docs/reviews/`, `docs/specs/`, and other ad-hoc files in `docs/`.

## Files in this directory

| File | Role | Start here if… |
|------|------|----------------|
| [pipeline.md](./pipeline.md) | **Operational overview** — multi-source daily pipeline, source toggles, CLI commands, validation, social OSINT, trends tab, file map | You need to run or operate the daily pipeline |
| [8-component-analysis-end-to-end.md](./8-component-analysis-end-to-end.md) | **Implementation reference** — 8 components, ~165 signal types, scoring math, reliability instruments, UI reading guide, QA harness | You need to understand scoring, signals, or change resilience logic |
| [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) | **Geographic enrichment** — `geo` envelope, north scoping, reference data, matching pipeline | You work on locality resolution or north filters |

### What each doc covers (current app state, 2026-05-25)

- **pipeline.md** — Modern `extract-signals` + `assess-signals` path (production default), legacy `analyze-resilience`, seven toggled source types in `pipeline-config.json` (including **social** X + Telegram), **pbo_regional** assess-time discovery, validation collection, catalog learning gap reports, search trends UI, `daily-pipeline.sh`, slash commands (`/8comp-3`, `/8comp-3-north`).
- **8-component-analysis-end-to-end.md** — Full framework depth: multipass extraction, verification, deterministic scoring, epistemic scope partition, data void index, bootstrap/EWMA/polarization/chronic baseline, drift dashboard, golden corpus, adversarial tests, OOV/learning capture, operator vs analyst display tiers. Auto-synced component/facet tables from code.
- **GEOGRAPHIC-ANALYSIS.md** — `IGeoEnrichmentPort`, envelope contract (nested + flat aliases), WhatsApp/survey/news geo attach, `scopeDecision` vs `geo.scopeDecision`, `regionSignalFilter`, unknown-locality review sinks.

Operator-facing instruments and feature flags are summarized in [`docs/MODEL-CARD.md`](../MODEL-CARD.md) (companion to the 8-component doc, not duplicated here).

## Auto-sync

Sections marked with `<!-- docs-sync:BEGIN … -->` / `<!-- docs-sync:END … -->` in **8-component-analysis-end-to-end.md** are regenerated from code (`resilienceComponents.js`, `componentFacets.js`, UI translations) on every CI run and via:

```bash
npm run docs:sync
```

Do not hand-edit content between those markers. Edit the source modules instead.

API reference pages under `product_docs/api/generated/` are regenerated from `openapi/openapi.yaml` as part of the same sync. The spec includes **SocialMedia** (7 routes) and **SearchTrends** (3 routes) tags alongside existing modules.
