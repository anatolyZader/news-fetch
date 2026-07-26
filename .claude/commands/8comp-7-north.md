---
allowed-tools: Bash(npm run pipeline:run*), Bash(mkdir -p logs), Bash(mkdir -p logs && *), Bash(*>> logs/*), Bash(* 2>> logs/*), Bash(tail*), Agent
description: 14-day north assessment via preset 8comp-7-north (reuse-first ingest)
---

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


Run north-focused 14-day assessment. Ingest is reuse-first; if national 14d bundles exist, most steps are no-ops before assess. Do NOT ask for confirmation — just go.

### Argument parsing

1. **Optional date** `dd:mm:yyyy` or `dd/mm/yyyy`.
2. **Optional** `--force`.

Validate date; reject future dates.

```
mkdir -p logs && echo "=== Pipeline run: north <target date> | preset: 8comp-7-north | window: 14d ===" > logs/pipeline-run-north-<target date>.log
```

### Run

```
npm run pipeline:run:cli -- --preset 8comp-7-north [--force] [--date YYYY-MM-DD] 2>> logs/pipeline-run-north-<target date>.log
tail -5 logs/pipeline-run-north-<target date>.log
```

Use `--assess-only` only if you verified all window bundles exist and want to skip ingest entirely:

```
npm run pipeline:run:cli -- --preset 8comp-7-north --assess-only [--date YYYY-MM-DD] 2>> logs/pipeline-run-north-<target date>.log
```

---

## Final report

Spawn an Agent summarizing log, north report JSON, reuse vs extract, national signals loaded vs north filter retention, warnings/errors, component scores, report path.
