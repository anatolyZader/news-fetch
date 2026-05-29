# Repository documentation

All documentation for this repo lives under **`docs/`**.

## Product docs (`product_docs/`)

Customer-facing guides, concepts, API reference (generated), and architecture pages. Served in-app (`/api/docs/*`) and published via [docs-site](./docs-site/).

- Validated with `npm run docs:check`
- Regenerated API pages: `npm run docs:sync` (via Docusaurus `gen:api`)

## Canonical references (`main_docu_files/`)

Overarching, maintained reference documents auto-synced from code in CI (`npm run docs:sync`). Start here for the resilience model, geographic enrichment, and daily pipeline.

## Working documentation

| Area | Purpose |
|------|---------|
| [specs/](./specs/) | Feature and module specifications |
| [reviews/](./reviews/) | Deep dives, audits, NotebookLM primers |
| [docs-site/](./docs-site/) | Docusaurus site (reads `product_docs/`) |
| `*.md` at this level | Ad-hoc guides (audio, identity, UI, env examples) |

## CI / GitHub Actions

Setup for secrets, permissions, and optional API keys: [`.github/CI-SETUP.md`](../.github/CI-SETUP.md).
