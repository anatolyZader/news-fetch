# Main documentation (`main_docu_files`)

Engineering reference for **Srulik's lab** — a homefront **decision-support** system, not a scoring dashboard.

**Not an oracle.** The product narrows operator attention with evidence-backed narratives and instrument flags (sufficiency, contested, significant change). Humans decide under explicit uncertainty. Deterministic scores still run for calibration and on-disk artifacts, but the **default operator UI and API hide headline 1–10 scores**.

Companion policy summary: [`docs/MODEL-CARD.md`](../MODEL-CARD.md). Product-facing anchor: [`cross-cut-modules/docs/content/pages/concepts/decision-support-model.md`](../../cross-cut-modules/docs/content/pages/concepts/decision-support-model.md).

## Reading order

| # | File | When you need… |
|---|------|----------------|
| 1 | [SYSTEM-AND-OPERATOR-MODEL.md](./SYSTEM-AND-OPERATOR-MODEL.md) | What operators see, scan → proof → decide, operator vs analyst apps |
| 2 | [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md) | Daily ingest, extract, assess, artifacts on disk, guided report |
| 3 | [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md) | Epistemic gates, instruments, pipeline stages, scoring machinery |
| 4 | [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) | Geo envelope, district scoping, unknown queue |
| 5 | [RAG.md](./RAG.md) | Hybrid retrieval, namespaces, reindex commands |
| 6 | [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md) | Report chat, tool loop, HITL confirm, validation agent |
| 7 | [COST-CONTROLS.md](./COST-CONTROLS.md) | Daily HTTP budget, costly routes |

Plus [README.md](./README.md) (this file) — **8 markdown files** in this directory.

## NotebookLM upload bundle

### Core (decision-support + pipeline)

Upload **these 8 files** plus [`docs/MODEL-CARD.md`](../MODEL-CARD.md) and [`cross-cut-modules/docs/content/pages/concepts/decision-support-model.md`](../../cross-cut-modules/docs/content/pages/concepts/decision-support-model.md).

### Recommended for technical review (+4)

Add these for scoring math, architecture synthesis, and terminology (aligned with current code):

| File | Role |
|------|------|
| [`docs/architecture/ubiquitous-language.md`](../architecture/ubiquitous-language.md) | Shared glossary |
| [`docs/reviews/application-architecture-and-analysis-deep-dive.md`](../reviews/application-architecture-and-analysis-deep-dive.md) | End-to-end synthesis, strengths/weaknesses, scoring baseline |
| [`docs/reviews/8-component-resilience-pipeline-notebooklm.md`](../reviews/8-component-resilience-pipeline-notebooklm.md) | NotebookLM-optimized pipeline primer + study prompts |
| [`docs/reviews/geographic-analysis-implementation.md`](../reviews/geographic-analysis-implementation.md) | Optional — geo matching, unknown queue (skip if geo is out of scope) |

For epistemic policy and display redaction detail, prefer [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md) over the review docs.

## Auto-sync

Sections between `<!-- docs-sync:BEGIN … -->` / `<!-- docs-sync:END … -->` in **[RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md)** (Appendix only) are regenerated from code on CI and via:

```bash
npm run docs:sync
```

Sources: `business_modules/resilience/domain/resilienceComponents.js`, `componentFacets.js`, `client/src/i18n/translations.js`. Do not hand-edit content between those markers.

## Terminology

See [`docs/architecture/ubiquitous-language.md`](../architecture/ubiquitous-language.md) for **Operator**, **Analyst**, **Maintainer**, **Report scope**, **Principal**, and related terms.
