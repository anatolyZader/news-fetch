---
allowed-tools: Bash(npm run pipeline:run*), Bash(mkdir -p logs), Bash(mkdir -p logs && *), Bash(*>> logs/*), Bash(* 2>> logs/*), Bash(tail*), Agent
description: Full 3-day north pipeline — always-reextract via preset 8comp-3-north
---

<!-- Adding a pipeline source? Update PIPELINE_ACTIONS + executeIngestStep in pipelineIngestPlan.js / pipelineOrchestrator.js -->

## Your task

Run the 3-day **north-focused** pipeline (national comparison context in assess). Do NOT ask for confirmation — just go.

### Argument parsing

1. **Optional date** `dd:mm:yyyy` or `dd/mm/yyyy` → replay mode.
2. **Optional** `--force` → also re-fetch `.md` sources and re-gather social OSINT.

Validate date; reject future dates. Convert to `YYYY-MM-DD`.

```
mkdir -p logs && echo "=== Pipeline run: north <target date> | preset: 8comp-3-north | force: <yes/no> ===" > logs/pipeline-run-north-<target date>.log
```

### Run

Unified orchestrator (`--always-reextract` is set by preset):

```
npm run pipeline:run -- --preset 8comp-3-north [--force] [--date YYYY-MM-DD] 2>> logs/pipeline-run-north-<target date>.log
tail -5 logs/pipeline-run-north-<target date>.log
```

---

## Final report

Spawn an Agent:

> Read `logs/pipeline-run-north-<target date>.log`, find north report JSON, summarize mode/force, preflight vs execution (including social), visits re-extract scope, national vs north signal counts from log, warnings/errors, per-component scores, report path.
