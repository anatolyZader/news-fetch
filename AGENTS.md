# Agent index (read every session)

Lean index + constitution. **Not documentation** — deep docs live in linked files. Keep this file under 200 lines.

## Project in one paragraph

**Srulik's lab** — homefront decision-support (Node/Fastify API + React SPA). Evidence-backed claims, assessment agent + RAG; humans decide. Layout: `business_modules/` (domain), `cross-cut-modules/` (shared), `client/` (UI), root `app.js`/`server.js` (wiring only).

## Where to look (load on demand)

| Need | File |
|------|------|
| Operator model, evidence tree | `docs/main_docu_files/SYSTEM-AND-OPERATOR-MODEL.md` |
| Daily pipeline, artifacts | `docs/main_docu_files/PIPELINE-AND-SOURCES.md` |
| Assessment agent, scoring | `docs/main_docu_files/RESILIENCE-ENGINE-REFERENCE.md` |
| Chat + tools | `docs/main_docu_files/LLM-CHAT-AND-AGENTS.md` |
| LLM budgets | `docs/main_docu_files/COST-CONTROLS.md` |
| Module layout | `.cursor/skills/create-business-module/SKILL.md` |
| Architecture overview | `cross-cut-modules/docs/content/pages/architecture/system-overview.md` |
| Module map | `cross-cut-modules/docs/content/pages/architecture/module-map.md` |
| Session memory (decisions, dead ends) | `memory.md` |
| npm script → module entry | `scripts/agent-routing.md` |

## Task routing (read first)

Read the routing table first. Do not open other modules until the entry file proves a dependency.

| If the task is… | Start here (only) |
|-----------------|-------------------|
| Report chat / tools | `business_modules/chat/AGENTS.md` → `input/chatRoutes.js`, `app/chatLlmOrchestrator.js` |
| Assessment agent / operator scoring prep | `business_modules/resilience/AGENTS.md` + `resilience_assessment/app/assessmentOrchestrator.js` — use `app/scoringFacade.js` for headline /10 only |
| Headline /10, validation, tuning, drift (analyst) | `analyst/README.md` — **not** operator daily work |
| Signal extract / assess CLI | `business_modules/resilience/input/extract-signals.js`, `assess-signals.js` — parallel open bundles `observations-pipeline-{source}-{date}.json` for news/radio/field/whatsapp, social, pbo, pbo_regional, naftali (default ON via `RESILIENCE_OPEN_EXTRACT_PARALLEL`) |
| Ingest news/audio/social | `composition/registerIngestion.js` → module `input/` (see `scripts/agent-routing.md`) |
| UI tab / component | `client/src/` + matching `business_modules/*/input/*Routes.js` |
| API contract | `openapi/openapi.yaml` |
| Wiring / DI | `composition/wireApplication.js` + `register*.js` |
| Cost / budget | `cross-cut-modules/budget/` |
| RAG / retrieval | `cross-cut-modules/retrieval/` |

## Module entry rule

Read `business_modules/<m>/index.js` first for any module task. Never grep the whole module tree.

## Navigation aids

| Aid | Use when |
|-----|----------|
| `npm run deps:boundaries` | After cross-module edits — confirms no boundary violations |
| `openapi/openapi.yaml` | API shape — not every route file |
| `business_modules/<m>/index.js` | Public facade of a module |
| `composition/register*.js` | Who wires whom (`wireApplication.js` orchestrates) |
| `scripts/agent-routing.md` | Which `npm run` script maps to which module `input/` |

## Prompt discipline (user)

Name **module + layer + file** in every task message.

- **Good:** `Fix chat tool timeout in business_modules/chat/app/chatLlmOrchestrator.js around runToolLoop. Do not read resilience or client unless needed.`
- **Bad:** `fix the chat` (triggers repo-wide search).

## Constitution (do not re-explain)

- **Module structure:** `business_modules/<name>/{app,domain,infrastructure}`; `input/` only for transport entry points.
- **No cross-module imports** — use ports/events/composition root.
- **Scores:** operator UI hides headline 1–10; primary path is agent investigation + claims.
- **Abstention is valid** — not "all clear."
- **Client changes:** run `npm run client:build`; restart `pm2 restart news` (or equivalent).
- **Secrets:** never read/commit `.env`, `secrets/`, `service-account*.json`.
- **Report bot sync:** do not change report-bot flows without checking `business_modules/report_bot/` integration.
- **Tests mirror source:** `tests/business_modules/<module>/...`.
- **Grind loop disabled** — no stop-hook follow-ups; one task per chat when possible.

## Agent workflow (token economy)

1. **Plan before code** on non-trivial tasks: confirm approach at ~95% confidence; ask questions first.
2. **Minimal context:** `@path/to/file` + line/function — never "search the whole repo" when a path is known.
3. **Read slices:** one function or small range, not whole large files.
4. **One user message = one round:** batch related asks; user should combine prompts too.
5. **Shell output limits:** `git log -5`, `git diff --stat`, `head`/`tail` on long output; never unbounded `npm install` logs in context.
6. **Subagents / Task tool:** only for large parallel exploration; prefer direct grep/read for needle queries. Default model: fast/cheap unless architecture review.
7. **No verbose narration:** result first, short prose; skip preambles and step-by-step play-by-play unless asked.
8. **New task → new chat** (Cursor) or `/clear` (Claude Code). At ~60% context, summarize to `memory.md` and start fresh — do not wait for auto-compact at 95%.
9. **MCP:** only enable servers needed for the current task.
10. **No grind loop** — do not write `DONE` to scratchpad to trigger extra turns.

## Commands (common)

```bash
npm start              # API + static client/dist
npm run client:build   # after client/ edits
npm test               # vitest
npm run lint           # eslint
pm2 restart news       # prod reload on this host
```

## Model policy

| Task | Model |
|------|-------|
| Default coding | Sonnet / Composer fast |
| Simple format/search | Haiku / fast |
| Architecture review | Opus / thinking — ~15–20% of usage |
| Repo-wide exploration | Task/subagent once, then new chat |

Max 1–2 focused sessions; no parallel "10 agents" pattern.

## Output style

Concise. Tool results and code first. No filler ("I'd be happy to…"). User may write in any language; **instructions and code comments in English**.

## Session checklist

| When | Action |
|------|--------|
| New task / project switch | New Cursor chat or Claude `/clear` |
| Context ~60% | `/compact` — save task + decisions to `memory.md` |
| Break >5 min | `/clear` or accept higher first-message cost |
| Complex change | Plan mode first; approve plan before edits |
| Bug in one function | `@file:start-end` not whole file |
| Large refactor | Off-peak hours (optional; MSK 22:00–15:00) |
| Agent wandering | Stop early, narrow the prompt |
| End of day | Check usage dashboard |
