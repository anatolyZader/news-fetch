---
description: Token economy — context hygiene for agent sessions
---

<!-- Ported from .cursor/rules/token-economy.mdc — edit both together. Always-on (no paths scoping). Session-hygiene commands (/clear, /compact at 60%) live in CLAUDE.md — not repeated here. -->

# Token economy

Every message re-reads full history plus rules, skills, and MCP tool schemas. Optimize aggressively.

## Context

- Read `AGENTS.md` task routing table before exploring.
- After cross-module edits, run `npm run deps:boundaries`.
- Prefer a named file with line/function over repo-wide search when the user named a location.
- Read file slices (line ranges), not entire large files unless necessary.
- Do not load `docs/` wholesale — use `AGENTS.md` index and open one doc.
- After task switch, user should start a **new chat**; at high context, summarize to `memory.md` and reset (thresholds in CLAUDE.md).

## Shell commands

- `git log -10` max (or `-5` default); never unbounded log.
- `git diff` with path scope; prefer `--stat` for overview.
- Pipe long output: `... | head -50` / `tail -50`.
- Avoid re-running identical exploration commands in one session.

## Agents and models

- **Task/subagents:** only for broad exploration; use direct tools for targeted lookups.
- Default to faster/cheaper models for search, format, simple edits; reserve thinking/opus for architecture.

## Grind loop

- **Disabled** — do not use stop-hook follow-ups or sentinel-file markers to trigger extra self-continuation turns.

## Responses

- Result and code first; minimal preamble.
- No repeating constitution items already in `AGENTS.md`.
