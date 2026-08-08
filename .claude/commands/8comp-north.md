---
allowed-tools: Bash(export PATH=*), Bash(export NODE_BIN=*), Bash(npm run pipeline:run*), Bash(mkdir -p logs), Bash(mkdir -p logs && *), Bash(*>> logs/*), Bash(* 2>> logs/*), Bash(tail*), Bash(python3 -c *)
description: 1-day north pipeline for a specific past date — reuse-first replay via preset 8comp-north-replay
---

<!-- Adding a pipeline source? Update PIPELINE_ACTIONS + executeIngestStep in pipelineIngestPlan.js / pipelineOrchestrator.js -->

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


Run the 1-day **north-focused** pipeline for a specific past date (national comparison context in assess). Do NOT ask for confirmation — just go.

**Do NOT** start a Monitor task, `tail -f` loop, or poll every few seconds. Launch the pipeline once in background if needed; summarize from artifacts when it finishes.

### Argument parsing

1. **Required date** `dd:mm:yyyy` or `dd/mm/yyyy` → replay mode. If absent or invalid: `Usage: /8comp-north dd:mm:yyyy [--force] [--reextract]` and stop.
2. **Optional** `--force` → also re-fetch `.md` sources and re-gather social OSINT.
3. **Optional** `--reextract` → full re-extract (preset `8comp-north`, always-reextract). Default is reuse-first (`8comp-north-replay`).

**Visits are held out of `--reextract`** — they reuse their existing signal bundles even under always-reextract, because visit report `.md` files do not change between field rounds. Re-enable with `RESILIENCE_VISITS_REEXTRACT_HOLD=0` once new visits bundles land, or force a single run with `--force`.

Validate date; reject future dates. Convert to `YYYY-MM-DD`.

### Environment (required — avoids `npm: command not found`)

```
export PATH="/home/eventstorm1/.nvm/versions/node/v22.13.0/bin:$PATH"
export NODE_BIN="/home/eventstorm1/.nvm/versions/node/v22.13.0/bin/node"
```

Replay preset `8comp-north-replay` auto-enables bundle reuse when unset (`applyDefaultReplayReuseEnv` in pipeline orchestrator). To force re-extract, use `--reextract` / preset `8comp-north` instead of setting reuse flags to `0`.

Optional overrides (only if you need to disable a single source):

```
export RESILIENCE_REPLAY_REUSE_NEWS=1
export RESILIENCE_REPLAY_REUSE_WHATSAPP=1
export RESILIENCE_REPLAY_REUSE_PBO=1
export RESILIENCE_REPLAY_REUSE_VISITS=1
```

### Log header

```
mkdir -p logs && echo "=== Pipeline run: north <target date> | preset: <preset> | force: <yes/no> ===" > logs/pipeline-run-north-<target date>.log
```

### Run (default: reuse-first replay)

```
npm run pipeline:run:cli -- --preset 8comp-north-replay [--force] --date YYYY-MM-DD 2>> logs/pipeline-run-north-<target date>.log
```

Full re-extract (expensive — only when bundles stale or `--reextract`):

```
npm run pipeline:run:cli -- --preset 8comp-north [--force] --date YYYY-MM-DD 2>> logs/pipeline-run-north-<target date>.log
```

### Assess-only (narrative/polish fixes — skip ingest)

Use when signal bundles already exist and you only need a new report. Pass `--force` if a normal report already exists.

```
npm run pipeline:run:cli -- --preset 8comp-north-replay --assess-only [--force] --date YYYY-MM-DD 2>> logs/pipeline-run-north-<target date>.log
```

### Historical QA with assessment agent (optional)

Default closed-core assess skips the specialist agent (faster, cheaper). For Jun-10-style agent traces + divergence on a **past date replay only**:

```
export RESILIENCE_CLOSED_CORE_ASSESS=0
export RESILIENCE_ASSESSMENT_AGENT_MAX_USD=2.50
npm run pipeline:run:cli -- --preset 8comp-north-replay --assess-only --force --date YYYY-MM-DD 2>> logs/pipeline-run-north-<target date>.log
```

Unset `RESILIENCE_CLOSED_CORE_ASSESS` (or `=1`) for daily/cron. Narrative strict mode (developer replays only): `RESILIENCE_NARRATIVE_GROUNDING_BLOCK=1`.

---

## Final report (read artifacts — do NOT spawn an Agent on the full log)

When the pipeline exits, summarize from built-in monitoring only:

```
tail -30 logs/pipeline-run-north-<target date>.log
python3 -c "
import json, glob
p='cross-cut-modules/budget/resilience_analysis/token-report-<YYYY-MM-DD>-north.json'
r=json.load(open(p))
print('duration_min', round(r['durationMs']/60000,1))
print('llm_usd', round(r['summary']['costUsd'],4))
print('top_features', sorted(r['byFeature'].items(), key=lambda x:-x[1]['costUsd'])[:6])
"
```

Also check log for `Reports written:` lines and any `Cost cap` / `run-pipeline failed` errors.

Post-run audit digest:

```
npm run pipeline:audit -- --date YYYY-MM-DD --scope north
```

In your reply: preset used, force/reextract, reuse vs extract (from ingest plan), signal count at assess, warnings/errors, report JSON path, token-report cost and duration. Keep under ~30 lines.
