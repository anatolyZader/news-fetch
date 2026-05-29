---
title: "Cost controls"
description: "How budgets, retries, and caps keep automated runs safe."
intent: operations
audience: ["internal"]
stability: beta
canonical: "https://docs.srulik.ai/operations/cost-controls"
version: "current"
tags: ["operations", "cost", "budgets"]
---

## Purpose
Keep LLM spend predictable. Srulik's lab touches three paid providers — Anthropic (extraction and narrative), OpenAI (audio transcription), and NewsAPI.ai (news fetches) — and the cost of each is a function of input size, which changes day to day. This guide explains what drives cost, where the budget caps live, and how to catch an unexpected spike before it compounds.

## Prerequisites
- **Required**: Basic understanding that LLM calls incur variable, token-based cost.
- **Recommended**: A habit of reviewing `cost-log.jsonl` at the end of each run.

## Inputs
- **Budget env vars** (where configured) — daily or per-run caps that stop execution rather than overspend.
- **Workload** — the number of articles, WhatsApp messages, or minutes of audio you process in a given run.
- **Cost log** — `cost-log.jsonl` at the repo root, appended to by each LLM call.

## Outputs
- **Bounded spend**: a run stops (or degrades gracefully) when a cap is reached, with an explicit log message.
- **Audit trail**: every LLM call logged with model, tokens in/out, cost, and source tag. This is your ground truth for "what did today cost?"

## Constraints
- **Never silently overspend.** Budget caps should halt a run with a clear message; warnings in logs alone aren't enough.
- **Cost scales with *input* size, not just final output.** An LLM pre-filter that keeps 10 articles from 1,000 candidates still charges for all 1,000.
- **Retries multiply cost.** Aggressive retries on a rate-limit error can double a run's cost. Prefer exponential backoff over fixed retry counts.
- **Model choice matters.** Haiku is ~30× cheaper than Opus for the same token volume. Use the cheapest model that achieves acceptable quality for each task; don't default to the biggest.
- **Watch the tail.** A single very long article (long news piece, full audio transcript) can dominate the day's cost.

## What drives cost (per source)

| Source | Dominant cost driver | Mitigation |
|---|---|---|
| News (homefront) | LLM pre-filter over all NewsAPI candidates | Tighten NewsAPI query; headline prefilter before LLM |
| WhatsApp | Signal extraction over all stored messages | Filter to message types/groups that matter |
| Audio | Whisper (charged per minute) + extraction over the transcript | Trim audio before upload; skip silent sections |
| Resilience analysis | Extraction + narrative generation | Smaller model for extraction, Opus only for narrative if needed |

## Examples

### Operational checklist for cost safety

- Set per-run and daily caps via environment variables where supported.
- Watch `cost-log.jsonl` daily for outliers.
- Keep batching and queries stable across days so day-over-day comparisons are meaningful.
- Snapshot a "normal" day's cost and treat a 2× increase as an anomaly worth investigating.

### Check if cost logging is active

```bash runnable
ls -1 cost-log.jsonl 2>/dev/null || true
```

Expected: the file exists if you've run any cost-tracked workflows. A missing file on a fresh install is fine.

### Today's spend summary

If you have `jq` installed:

```bash runnable
tail -n 500 cost-log.jsonl 2>/dev/null | jq -s 'map(.cost_usd // 0) | add' 2>/dev/null || echo "jq not installed"
```

Expected: a number (in USD) for the most recent 500 calls, or a message saying `jq` isn't installed.

### Find outlier calls

```bash runnable
tail -n 200 cost-log.jsonl 2>/dev/null | sort -t'"' -k8 -n 2>/dev/null | tail -n 5 || true
```

Expected: the most expensive recent calls. Use this to find a single pathological input that's dominating the day.

### Set a cap before a big run

Many scripts honor a `COST_CAP_USD` environment variable. Set it before a large backfill:

```bash runnable
COST_CAP_USD=5 npm run extract-signals
```

Expected: the run aborts with an explicit message when cumulative cost reaches `$5`. Adjust the cap deliberately for large backfills — don't disable it.

## Troubleshooting
- **Run exits early citing budget cap**
  - **Check**: the configured cap vs. today's workload.
  - **Fix**: either reduce inputs (filter more aggressively, narrow the date window) or raise the cap intentionally with a brief written note.
- **Costs jumped day-over-day without an obvious cause**
  - **Check**: whether a new source was enabled, a prompt was changed, or batching drifted (e.g., retries, chunk size).
  - **Fix**: compare `cost-log.jsonl` between two days and look for a different input size or a new source tag. Reconcile one side to match.
- **Retries are inflating cost**
  - **Check**: server logs for repeated calls to the same input.
  - **Fix**: add exponential backoff; cap retry count; treat persistent failures as fatal rather than retrying indefinitely.
- **Audio transcription cost dominates**
  - **Check**: total minutes of audio processed today.
  - **Fix**: trim recordings, skip silent hours, or batch only the high-signal time windows. See [Audio ingestion](../guides/audio-ingestion.md).
- **Opus used where Haiku would have sufficed**
  - **Check**: the model configured in the failing/expensive script.
  - **Fix**: switch extraction to Haiku or Sonnet and reserve Opus for narrative generation or final reasoning only. Measure quality before and after.
- **Cost log is missing entries I expected**
  - **Check**: whether the script path actually writes to `cost-log.jsonl` — older ad-hoc scripts may not.
  - **Fix**: route new scripts through the shared cost-logging helper so the audit trail stays complete.

See [Observability](observability.md) for how cost ties into the overall debug flow.
