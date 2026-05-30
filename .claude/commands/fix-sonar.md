---
description: Fix all open SonarCloud issues one-by-one in a single run (matches IDE panel)
---

## Your task

Fix **every** open SonarQube issue for this project in **one run**. Process issues **one at a time** — no batch limit, no "run again for the next batch". Do NOT ask for confirmation — just go.

**Queue source:** SonarCloud open issues (same scope as VS Code SonarQube Connected Mode panel). After each fix, verify **that specific issue** at **that line** with `verify-sonar-issue.mjs` so it clears locally on save.

### Argument parsing

| Token | Effect |
|---|---|
| *(none)* | Full loop: all open SonarCloud issues until queue empty |
| `--dry-run` | List full queue only; do not edit files |
| `--local-only` | Offline fallback: profile-aligned local ESLint queue (not default) |
| `--branch <name>` | SonarCloud branch filter (default: current git branch) |
| `--in-new-code` | Restrict remote queue to new-code period |
| `--hotspots` | Include `TO_REVIEW` security hotspots in remote queue |

Examples: `/fix-sonar`, `/fix-sonar --dry-run`, `/fix-sonar --local-only`

**Removed:** `--limit` as a default batch size. Process the entire queue.

---

### Step 0 — Preflight

Require `SONAR_TOKEN` and `SONAR_PROJECT_KEY` in `.env` (loaded via dotenv in scripts). If missing:

```
Error: SONAR_TOKEN and SONAR_PROJECT_KEY are required.
Use --local-only for offline profile-aligned ESLint queue.
```

---

### Step 1 — Fetch full queue

Initialize the loop driver and fetch **all** open issues on the **current git branch**:

```
node scripts/sonar/fix-sonar-loop.mjs --init [--in-new-code] [--branch <name>]
node scripts/sonar/list-sonar-issues.mjs --all-issues --json [--in-new-code] [--branch <name>]
```

(or `--local-only` on both commands when offline)

Parse JSON. Issues are sorted **by file, then line** (not global alphabetical path order).

If `total` / queue length is 0 → report success and stop.

If `--dry-run`, print the full list grouped by file and stop.

---

### Step 2 — Loop until queue empty

Repeat until no remaining issues:

```
node scripts/sonar/fix-sonar-loop.mjs --next-batch
```

Process **every issue in the batch** before fetching the next batch. Default: **500 issues per batch** (`FIX_SONAR_BATCH_SIZE` in `scripts/sonar/sonar-defaults.mjs`); keep looping until `{ "done": true }`. Do **not** stop after 10 or 50 issues.

For each `{ issue }`:

1. Open `issue.file` at `issue.line`.
2. Read `issue.rule` and `issue.message`; apply the **smallest correct fix** matching project conventions.
3. Verify **this specific issue** (not whole-file clean):

```
node scripts/sonar/verify-sonar-issue.mjs --file <path> --line <n> --rule <javascript:Sxxxx>
```

- Exit 0 → mark fixed: `node scripts/sonar/fix-sonar-loop.mjs --mark-fixed <issue.key>`
- Exit 1 → skip with reason, move to end: `node scripts/sonar/fix-sonar-loop.mjs --mark-skipped <issue.key> --reason "<why>"`

4. Optional: `npm test -- <related test>` when practical; `npm run client:build` for client JSX changes.

**Skip and report** (do not guess):

- Security hotspots needing product/security judgment (unless fix is obvious)
- Generated paths (`articles_extracted/`, `reports/`, `signals/`, `client/dist/`, etc.)
- Issues where `verify-sonar-issue` returns `no-eslint-mapping` — note rule for manual follow-up

Do **not** require the entire file to have zero issues — only that **this** rule at **this** line is cleared.

---

### Step 3 — Report

```
node scripts/sonar/fix-sonar-loop.mjs --status
```

Report:

- Fixed (file:line + rule + key)
- Skipped (file:line + reason)
- Remaining count (must be 0 for success)

---

### Step 4 — Notes

- **IDE panel:** Fixed issues disappear on save when SonarLint passes the rule at that line.
- **SonarCloud API / quality gate:** Remote queue may lag CI until next scan; local verify drives IDE feedback.
- **Local lint:** `eslint.config.js` is unchanged; `eslint.sonar.config.js` is profile-aligned for Sonar verify only.
