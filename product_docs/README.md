## VibeSwitch product documentation

This directory is the **single source of truth** for product documentation content.

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

