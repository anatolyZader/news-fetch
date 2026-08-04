# Claude Code — project entry

Read **`AGENTS.md`** first (index, constitution, token rules). This file adds Claude Code–specific habits only.

## Session hygiene

- **Task routing:** see `AGENTS.md` § Task routing.
- **`/clear`** between unrelated tasks or projects — mandatory; cheapest win.
- **`/compact` at ~60% context** — instruct what to keep (current task, arch decisions, open files). Do not wait for 95% auto-compact.
- **`/context`** and **`/cost`** — inspect what burns tokens (history, MCP, system prompt).
- **5-minute prompt cache:** after a break >5 min, next message re-bills full context — `/clear` or `/compact` before pausing if resuming later.

## MCP

Disable servers not needed for the current task (each server can cost thousands of tokens per message). Prefer CLI/skills over MCP when available.

## Extended thinking

Cap thinking budget via project settings (`.claude/settings.json`):

```json
"env": { "MAX_THINKING_TOKENS": "10000" }
```

Use Opus/thinking only for architecture (~15–20% of sessions). Default to Sonnet.

## Status line

Configured in `.claude/settings.json` → `statusLine.command` → `~/.claude/statusline.sh`. Shows model + context % bar (like `/context` at a glance).

## Path-scoped rules

Conventions in `.claude/rules/` load automatically when editing matching paths (chat/resilience navigation, module structure, client rebuild, OpenAPI contract; `token-economy` is always-on). Mirrored from `.cursor/rules/` — edit both together.

## Memory outside chat

At session start, read **`memory.md`** (repo) and `~/.claude/projects/-home-eventstorm1-news/memory/` (Claude project memory). Do not re-explain rules already there.

## Bash permissions

- **Edits:** `permissions.defaultMode: "acceptEdits"` in `.claude/settings.json` auto-approves file edits under the project (still prompts for `.git`, `.claude`, `.env`, etc.).
- **Bash:** Compound `cd /home/eventstorm1/news && …` commands (including output to `logs/`) are auto-approved via `.claude/hooks/allow-pipeline-bash.sh`. Read-only `python3 -c` scripts that reference `/home/eventstorm1/news/` paths are auto-approved too (multiline `#` comments otherwise prompt). Prefer absolute paths or `cd … && cmd` without redirects when possible; if redirecting, use `logs/` or `/dev/null`.

## Slash commands

Pipeline commands live in `.claude/commands/` (analyze-news, analyze-radio, 8comp, etc.). External API slash commands must budget both $ and Claude tokens — see `memory.md`.

## Plan mode

On non-trivial tasks: plan first, user approves, then edit. No changes until ~95% confidence in the approach.

## Output

Same as AGENTS.md: no preamble, result first, stop.

## Future (optional)

n8n webhook automation and Telegram usage alerts — not configured; use Claude desktop Usage dashboard manually.
