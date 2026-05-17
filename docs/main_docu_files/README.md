# Main documentation (`main_docu_files`)

Canonical, **overarching** reference documents for this repository. They are kept separate from working notes under `docs/reviews/`, `docs/specs/`, and other ad-hoc files in `docs/`.

## Files in this directory

| File | Role |
|------|------|
| [8-component-analysis-end-to-end.md](./8-component-analysis-end-to-end.md) | Full resilience pipeline and 8-component framework (implementation reference) |
| [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md) | Geographic enrichment (`geo` envelope) developer guide |
| [pipeline.md](./pipeline.md) | Daily news resilience pipeline overview |

## Auto-sync

Sections marked with `<!-- docs-sync:BEGIN … -->` / `<!-- docs-sync:END … -->` in **8-component-analysis-end-to-end.md** are regenerated from code (`resilienceComponents.js`, `componentFacets.js`, UI translations) on every CI run and via:

```bash
npm run docs:sync
```

Do not hand-edit content between those markers. Edit the source modules instead.

API reference pages under `product_docs/api/generated/` are regenerated from `openapi/openapi.yaml` as part of the same sync.
