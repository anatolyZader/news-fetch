---
allowed-tools: Bash(npm run pipeline:run*), Bash(mkdir -p logs), Bash(mkdir -p logs && *), Bash(*>> logs/*), Bash(* 2>> logs/*), Bash(tail*), Agent
description: Full 14-day national pipeline via preset 8comp-7
---

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


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
npm run pipeline:run:cli -- --preset 8comp-7 [--force] [--date YYYY-MM-DD] 2>> logs/pipeline-run-national-<target date>.log
tail -5 logs/pipeline-run-national-<target date>.log
```

---

## Final report

Spawn an Agent summarizing log, report JSON, mode, force, sources run/reused/skipped, warnings/errors, component scores, report path.
