# Repository documentation

## Canonical references (`main_docu_files/`)

Overarching, maintained reference documents live in **[main_docu_files/](./main_docu_files/)**. They are auto-synced from code in CI (`npm run docs:sync`). Start there for the resilience model, geographic enrichment, and daily pipeline.

## Working documentation (this folder)

Everything else under `docs/` is supporting material: specs, reviews, checklists, and environment examples. These are **not** auto-synced unless noted otherwise.

| Area | Purpose |
|------|---------|
| [specs/](./specs/) | Feature and module specifications |
| [reviews/](./reviews/) | Deep dives, audits, NotebookLM primers |
| `*.md` at repo root of `docs/` | Ad-hoc guides (audio, identity, UI, etc.) |

Product-facing user docs are in [product_docs/](../product_docs/) (validated with `npm run docs:check`).

## CI / GitHub Actions

Setup for secrets, permissions, and optional API keys: [`.github/CI-SETUP.md`](../.github/CI-SETUP.md).
