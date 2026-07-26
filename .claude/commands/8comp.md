---
allowed-tools: Bash(npm run pipeline:run*), Bash(mkdir -p logs), Bash(mkdir -p logs && *), Bash(*>> logs/*), Bash(* 2>> logs/*), Bash(tail*), Agent
description: Full daily pipeline — preset 8comp (1-day national assess)
---

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


Run the daily national resilience pipeline via the unified orchestrator. Do NOT ask for confirmation — just go.

### Argument parsing

Optional tokens after the command name:

1. **Optional date** `dd:mm:yyyy` or `dd/mm/yyyy` → replay mode. Absent → today mode.
2. **Optional flag** `--force` → re-fetch sources and re-extract where applicable.

Validate date format; if invalid: `Usage: /8comp [dd:mm:yyyy|dd/mm/yyyy] [--force]`. Reject future dates.

Convert user date to `YYYY-MM-DD` internally.

Initialize log:
```
mkdir -p logs && echo "=== Pipeline run: national <target date> | preset: 8comp ===" > logs/pipeline-run-national-<target date>.log
```

### Run

```
npm run pipeline:run:cli -- --preset 8comp [--force] [--date YYYY-MM-DD] 2>> logs/pipeline-run-national-<target date>.log
tail -5 logs/pipeline-run-national-<target date>.log
```

Positional date (if provided) may be passed instead of `--date`.

---

## Final report

Spawn an Agent with this prompt, substituting `<target date>`:

> Summarize a completed resilience pipeline run. Read `logs/pipeline-run-national-<target date>.log`, find the report JSON path (`Reports written:` or `ls business_modules/resilience_scorer/data/reports/national-*-<DDMMYY>-*.json`), read it, and return mode, preset, policy, warnings/errors, per-component scores (id, score, confidence, signal_count), and report file path.
