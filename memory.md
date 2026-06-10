# Session memory (outside chat)

Update after `/compact` or end-of-task. Prune monthly — one line per rule, max ~15 words.

## Architecture decisions

- Primary assess path: assessment agent + RAG; operator UI hides headline 1–10 scores.
- Business modules: `app/`, `domain/`, `infrastructure/`; `input/` only for transport.
- Cross-module wiring: composition root + ports/events only.

## Patterns that work

- Load deep docs via AGENTS.md index links, not whole `docs/` tree.
- `@file` + line range for bugs; slice reads for large files.
- Slash commands with external APIs: pre-filter in jq, slim files, hard cap Claude input.

## Dead ends / do not repeat

- Do not anchor on numerical resilience scores — use evidence, signals, confidence, narratives.
- Editing classification prompts is not a re-run — ask before re-extract/re-assess.
- Exec summary examples must be analytically distinctive, not only emotionally vivid.

## Do not explain twice

- Report-bot changes require `business_modules/report_bot/` sync check first.
- Never commit `.env`, `secrets/`, `service-account*.json`.
- Large uncommitted WIP in this repo is normal — check `git status` before any commit.
- Prefer work-in-tree; user handles version control unless explicitly asked to commit.
- Baseline: ~22 lint errors and ~7 failing tests are pre-existing — compare to baseline.
- X API social OSINT: ~$10/backfill or ~$55/month, not $200–5K (UTC-day dedup).

## Do not open (cross-module)

- Chat bug → not `resilience/` prompts or `daily_reports/`
- Client CSS/layout → not `business_modules/` unless API payload unclear
- Cost/budget → `cross-cut-modules/budget/` only, not every LLM caller
- Report-bot change → `report_bot/` + `composition/registerIngestion.js` / `createApp.js` only

## Key file paths

| Area | Path |
|------|------|
| Composition / DI | `composition/wireApplication.js` |
| Server shell | `app.js`, `server.js` |
| Resilience pipeline | `business_modules/resilience/` |
| Report bot | `business_modules/report_bot/` |
| Client SPA | `client/src/` → build to `client/dist/` |
| Main engineering docs | `docs/main_docu_files/` |
| Claude project memory | `~/.claude/projects/-home-eventstorm1-news/memory/` |
