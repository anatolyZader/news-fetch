# Repository documentation (`/docs`)

> Full generated file index: [INDEX.md](./INDEX.md) (regenerate with `/compile-docs`)

**Rule:** Everything under **`docs/`** is optional engineering and reference material. You can remove this tree without breaking server startup or core API behavior.

Runtime content the app **does** depend on lives elsewhere:

| Purpose | Location |
|---------|----------|
| In-app Docs panel + public product pages | [`cross-cut-modules/docs/content/pages/`](../cross-cut-modules/docs/content/pages/) |
| HFC field-report RAG corpus | [`business_modules/report_build/data/hfc-field-guidelines.md`](../business_modules/report_build/data/hfc-field-guidelines.md) |
| Public docs site (Docusaurus) | [`docs-site/`](../docs-site/) |

## What's in `/docs`

| Area | Purpose |
|------|---------|
| [`main_docu_files/`](./main_docu_files/) | Decision-support engineering reference (operator model, pipeline, resilience engine, RAG, chat, cost) — component tables auto-synced in `RESILIENCE-ENGINE-REFERENCE.md` via `npm run docs:sync` |
| [`architecture/decisions/`](./architecture/decisions/) | Architecture decision records (ADRs) |
| [`specs/`](./specs/) | Feature and module specifications |
| [`reviews/`](./reviews/) | Audits, deep dives, NotebookLM primers |
| `*.md` at this level | Ad-hoc guides (audio, identity, UI, dependencies) |

## Commands (product content + validation)

These operate on **runtime product pages**, not on `/docs` itself:

- `npm run docs:check` — validate `cross-cut-modules/docs/content/pages/`
- `npm run docs:sync` — regenerate synced appendix in `main_docu_files/RESILIENCE-ENGINE-REFERENCE.md` and OpenAPI-derived API pages
- `npm run rag:reindex-docs` — index product pages for Docs-panel search
- `npm run rag:reindex-hfc` — index HFC guidelines for report-build RAG

Build the public site: `npm ci --prefix docs-site && npm run gen:api --prefix docs-site && npm run build --prefix docs-site`

## CI / GitHub Actions

Setup for secrets, permissions, and optional API keys: [`.github/CI-SETUP.md`](../.github/CI-SETUP.md).
