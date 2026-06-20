---
allowed-tools: Bash(npm run pipeline:run*), Bash(mkdir -p logs), Bash(mkdir -p logs && *), Bash(*>> logs/*), Bash(* 2>> logs/*), Bash(tail*), Agent
description: Full 3-day national pipeline via unified orchestrator (preset 8comp-3)
---

## Your task

Run the 3-day national resilience pipeline. Do NOT ask for confirmation — just go.

### Argument parsing

1. **Optional date** `dd:mm:yyyy` or `dd/mm/yyyy` → replay mode.
2. **Optional** `--force` → re-fetch/re-extract news/radio/whatsapp window sources.

Validate date; reject future dates. Convert to `YYYY-MM-DD`.

```
mkdir -p logs && echo "=== Pipeline run: national <target date> | preset: 8comp-3 | force: <yes/no> ===" > logs/pipeline-run-national-<target date>.log
```

### Run

```
npm run pipeline:run -- --preset 8comp-3 [--force] [--date YYYY-MM-DD] 2>> logs/pipeline-run-national-<target date>.log
tail -5 logs/pipeline-run-national-<target date>.log
```

---

## Final report

Spawn an Agent:

> Read `logs/pipeline-run-national-<target date>.log`, locate report JSON, summarize mode/preset/force, preflight vs execution, warnings/errors, per-component scores, report path.
