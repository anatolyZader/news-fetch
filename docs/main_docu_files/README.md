# Main documentation (`main_docu_files`)

Engineering reference for **Srulik's lab** — a homefront **decision-support** system, not a scoring dashboard.

**Not an oracle.** The product narrows user attention with **evidence-backed claims**, instrument flags (sufficiency, contested, significant change), and investigation metadata. Humans decide under explicit uncertainty. The **primary assess path** is an **assessment agent + RAG investigation** pipeline; deterministic scores still run as **shadow/calibration** on disk, but the **default user UI and API hide headline 1–10 scores**.

Companion policy summary: [`docs/MODEL-CARD.md`](../MODEL-CARD.md). Product-facing anchor: [`cross-cut-modules/docs/content/pages/concepts/decision-support-model.md`](../../cross-cut-modules/docs/content/pages/concepts/decision-support-model.md).

## Conceptual shift (post agent-RAG refactor)

The system is **not** “score the day, then narrate the score.” It is **investigate the evidence, then synthesize a decision-support view**.

- **Primary question:** what happened, with what evidence, and what needs attention — not “what is the 1–10 score?”
- **Unit of proof:** claims with `evidence_refs` in v2 schema; users see **`evidence_tree`** in the report UI
- **LLM role:** planner → parallel specialists → critic → synthesizer (investigation before synthesis)
- **Unchanged:** closed-catalog extraction; humans decide; abstention and data void as features; user tier hides headline scores

Full before/after tables: [RESILIENCE-ENGINE-REFERENCE.md §1](./RESILIENCE-ENGINE-REFERENCE.md#1-conceptual-and-technical-shift).

## Reading order

| # | File | When you need… |
|---|------|----------------|
| 1 | [SYSTEM-AND-USER-MODEL.md](./SYSTEM-AND-USER-MODEL.md) | What users see, scan → proof → decide, user vs developer display tiers, v2 evidence tree |
| 2 | [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md) | Daily ingest, extract, assess (agent + shadow), artifacts on disk, guided report, municipal PBO review |
| 2b | `business_modules/pbo_report_review/` | Municipal PBO completeness gaps, officer email, inbound replies — see PIPELINE § Municipal PBO review |
| 3 | [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md) | Conceptual/technical shift, assessment agent, epistemic instruments, shadow scoring |
| 4 | [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) | Geo envelope, district scoping, unknown queue |
| 5 | [RAG.md](./RAG.md) | Hybrid retrieval, assess-time RAG, namespaces, reindex commands |
| 6 | [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md) | Report chat vs **assessment agent**, tool loops |
| 7 | [COST-CONTROLS.md](./COST-CONTROLS.md) | Daily HTTP budget, assess agent budget, costly routes |

Plus [README.md](./README.md) (this file) — **8 markdown files** in this directory.

## NotebookLM upload bundle

### Core (decision-support + pipeline)

Upload **these 8 files** plus [`docs/MODEL-CARD.md`](../MODEL-CARD.md) and [`cross-cut-modules/docs/content/pages/concepts/decision-support-model.md`](../../cross-cut-modules/docs/content/pages/concepts/decision-support-model.md).

### Recommended for technical review (+4)

Add these for **shadow scoring math**, architecture synthesis, and terminology (calibration supplements — not the primary user story):

| File | Role |
|------|------|
| [`docs/architecture/ubiquitous-language.md`](../architecture/ubiquitous-language.md) | Shared glossary |
| [`docs/reviews/application-architecture-and-analysis-deep-dive.md`](../reviews/application-architecture-and-analysis-deep-dive.md) | End-to-end synthesis; includes legacy scoring baseline |
| [`docs/reviews/8-component-resilience-pipeline-notebooklm.md`](../reviews/8-component-resilience-pipeline-notebooklm.md) | **Legacy** score-primary pipeline primer — do **not** upload alone; predates agent assess path |
| [`docs/reviews/geographic-analysis-implementation.md`](../reviews/geographic-analysis-implementation.md) | Optional — geo matching, unknown queue |

For epistemic policy, assessment agent flags, and display redaction, prefer [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md) and [MODEL-CARD.md](../MODEL-CARD.md) over the review docs.

## Auto-sync

Sections between `<!-- docs-sync:BEGIN … -->` / `<!-- docs-sync:END … -->` in **[RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md)** (Appendix only) are regenerated from code on CI and via:

```bash
npm run docs:sync
```

Sources: `business_modules/resilience_scorer/domain/resilienceComponents.js`, `componentFacets.js`, `client/src/i18n/translations.js`. Do not hand-edit content between those markers.

## Module boundaries (Option B)

Business modules follow a layered layout enforced in CI:

- **`input/`** — transport only (HTTP routes, CLI wrappers); delegates to **`app/`** services.
- **`app/`** — orchestration and application services.
- **`domain/`** / **`infrastructure/`** — entities, ports, adapters (no cross-module imports).
- **Facades** — other modules import shared capabilities via `business_modules/<name>/index.js`, not deep paths.

Run `npm run deps:boundaries` locally (same check as CI; config `.dependency-cruiser.cjs`, smoke test `tests/architecture/dependencyBoundaries.test.js`). Full module map: [`cross-cut-modules/docs/content/pages/architecture/module-map.md`](../../cross-cut-modules/docs/content/pages/architecture/module-map.md).

## Terminology

See [`docs/architecture/ubiquitous-language.md`](../architecture/ubiquitous-language.md) for **User**, **Developer**, **Maintainer**, **Report scope**, **Principal**, and related terms.
