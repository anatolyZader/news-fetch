## App product content (in-app Docs panel + public site)

This directory is **runtime product content**, not optional repo documentation under `/docs`.

Pages here are served by the app (`/api/docs/*`), indexed for Docs-panel RAG (`npm run rag:reindex-docs`), and published via [docs-site](../../../../docs-site/).

Deleting `/docs` does not remove this tree — the server and public docs site depend on it.

### Information architecture (split by intent)
- **Getting Started**: fastest path to first success (≤10 minutes)
- **Concepts**: mental models (no code-first)
- **Guides**: task-oriented workflows (real scenarios)
- **API**: generated, strictly factual (derived from OpenAPI)
- **Architecture**: internal system design (advanced users)
- **Playbooks**: operational runbooks (often gated)

### Required frontmatter
All pages must include YAML frontmatter matching `frontmatter.schema.json`:
- `title`, `intent`, `audience`, `stability`, `canonical`

### Required section structure
All pages should follow the section structure in `_template.page.md` to stay:
- **LLM-friendly** (chunkable, deterministic)
- **Human-friendly** (quick scan, runnable examples, clear troubleshooting)

### Commands
- Validate: `npm run docs:check`
- Regenerate API pages: `npm run docs:sync` (via `docs-site` `gen:api`)
- Reindex RAG: `npm run rag:reindex-docs`
