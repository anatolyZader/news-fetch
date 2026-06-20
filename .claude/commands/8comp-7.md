---
allowed-tools: Bash(npm run pipeline:run*), Bash(mkdir -p logs), Bash(mkdir -p logs && *), Bash(*>> logs/*), Bash(* 2>> logs/*), Bash(tail*), Agent
description: Full 14-day national pipeline via preset 8comp-7
---

## Your task

Run the 14-day national pipeline. Do NOT ask for confirmation — just go.

### Argument parsing

1. **Optional date** `dd:mm:yyyy` or `dd/mm/yyyy` → replay mode.
2. **Optional** `--force`.

Validate date; reject future dates. Convert to `YYYY-MM-DD`.

```
mkdir -p logs && echo "=== Pipeline run: national <target date> | preset: 8comp-7 | window: 14d ===" > logs/pipeline-run-national-<target date>.log
```

### Run

```
npm run pipeline:run -- --preset 8comp-7 [--force] [--date YYYY-MM-DD] 2>> logs/pipeline-run-national-<target date>.log
tail -5 logs/pipeline-run-national-<target date>.log
```

---

## Final report

Spawn an Agent summarizing log, report JSON, mode, force, sources run/reused/skipped, warnings/errors, component scores, report path.
