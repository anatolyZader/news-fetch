---
title: "Common failures"
description: "Operational playbook for frequent failure modes and how to resolve them."
intent: playbooks
audience: ["customer", "internal"]
stability: beta
canonical: "https://docs.srulik.ai/playbooks/common-failures"
version: "current"
tags: ["playbooks", "operations", "troubleshooting"]
llm:
  chunkHint: "Use if/then diagnostic flows."
---

## Purpose
The gated operator playbook for recovering from the most frequent production incidents in Srulik's lab. This page assumes you're on call, you can SSH (or the equivalent) to the server, you can reach the provider consoles (Firebase, NewsAPI.ai, Meta, OpenAI, Anthropic), and you're authorized to rotate secrets and restart the service. If you're a user rather than an operator, see the public [Common failures](https://docs.srulik.ai/operations/common-failures) page instead — it covers the same symptoms without the operator-level steps.

## Prerequisites
- **Required**: Access to server logs (stdout / platform log viewer) and the ability to restart the service.
- **Required**: Access to the secret manager or env configuration surface so you can rotate keys.
- **Required**: Admin access to the Firebase / Identity Platform project.
- **Required**: Admin access to the WhatsApp Business account in the Meta Developer console.
- **Recommended**: A runbook where you record incident timelines and post-mortems.

## Inputs
- **The symptom the user or alerting reported.** A UI message, an alert fire, an absent report, a cost-cap hit.
- **The date affected.** Almost every incident is date-scoped; capture it before doing anything else.
- **Your role in the response.** Are you triaging, fixing, or recording? Don't do all three at once.

## Outputs
- **A deterministic action sequence**: what you checked, what you changed, what you verified afterwards.
- **A short post-mortem entry**: symptom, root cause, fix, prevention. Even one sentence per field is enough.
- **(When relevant) a user-facing update** posted to whatever channel your users watch — especially when the report is stale or unavailable.

## Constraints
- **Gating.** This page is access-controlled by default — `intent: playbooks` makes it gated in the in-app Docs panel, and `playbooks/` pages are hidden from unauthenticated callers. Don't paste the content into public channels.
- **One change at a time.** Most incidents are single-cause. If you rotate a key, rebuild the client, and restart the server in one go, you won't know which action mattered.
- **Prefer deterministic checks over narrative guessing.** HTTP status codes, log lines, and files on disk are ground truth.
- **Don't suppress errors as shortcuts.** Commenting out a validation step to "make it work" is how silent drift gets introduced. Fix the underlying issue or escalate.
- **Preserve the evidence.** Snapshot the failing dated exports, signals JSON, and log lines before you re-run the pipeline. You'll want them for the post-mortem.

## Examples

### Fast triage sequence

Run these first, in order:

1. `curl -sS -o /dev/null -w "%{http_code}\n" http://SERVER/api/openapi.json` — is the server running?
2. `curl -sS http://SERVER/api/auth/config` — what's the auth posture?
3. `curl -sS -o /dev/null -w "%{http_code}\n" http://SERVER/api/docs/index` — is `product_docs/` deployed?
4. `curl -sS -o /dev/null -w "%{http_code}\n" http://SERVER/api/report/today` — is today's report cached?
5. `ls signals/ reports/ business_modules/news-sites/articles_extracted/` — which stages produced artifacts today?

Each step halves the possible causes. Don't skip ahead.

### Incident playbooks

#### P1 — "API key is required" at startup

**Symptom**: server refuses to start, logs say `API key is required`.

- **Check**: secret manager / env has `NEWSAPI_API_KEY`; the latest deploy actually read it (not a stale revision).
- **Fix**: set the key in the runtime env and restart. Confirm `/api/openapi.json` returns `200`. If the key was rotated, also update the value in your secrets vault and any CI that reads it.

#### P2 — Report is stale (yellow "outdated" banner)

**Symptom**: UI Report tab shows yesterday's date with a yellow banner.

- **Check**: `ls signals/signals-*-$(date +%F).json reports/*$(date +%F)*` — did today's pipeline run?
- **Fix**: run `./scripts/daily-pipeline.sh`. If it failed mid-stage, run the missing stage explicitly. Hard-refresh the UI after the assessment completes.

#### P3 — Every `/api/*` returns 401

**Symptom**: UI can't load data; unauthenticated `curl` returns `401`.

- **Check**: `/api/auth/config` — is `authRequired: true`? If yes, does the client have Firebase config baked in?
- **Fix**: if auth should be on, confirm `FIREBASE_PROJECT_ID` and runtime service account are correct (`firebase-admin` logs the verification failure reason on server stdout). If auth should be off, set `AUTH_REQUIRED=false` and restart.

#### P4 — Firebase sign-in closes with "unauthorized domain"

**Symptom**: users can't sign in; popup closes with an unauthorized-domain error.

- **Check**: Firebase Console → Authentication → Settings → Authorized domains.
- **Fix**: add the production domain (and any preview domains). Propagation is near-instant. No client rebuild required.

#### P5 — Upstream provider (NewsAPI / OpenAI / Anthropic) outage

**Symptom**: ingestion or extraction fails with 5xx or connection errors.

- **Check**: the provider's status page and your account dashboard (quota, billing).
- **Fix**: pause the affected stage, wait for upstream recovery, then replay the date. Don't spin retries indefinitely — each failed attempt burns cost. See [Cost controls](https://docs.srulik.ai/operations/cost-controls).

#### P6 — WhatsApp webhook stops delivering

**Symptom**: no new messages appear; `whatsapp_reports-<today>.md` is empty.

- **Check**: Meta Developer Console → your app → Webhooks — is the subscription active? Is the callback URL reachable over public HTTPS?
- **Fix**: if the verify token was rotated, re-verify in the Meta console. If the access token expired, rotate it in the console, update the runtime env, restart. Meta only delivers live — gaps are not recoverable after the fact.

#### P7 — Cost cap hit mid-run

**Symptom**: pipeline aborts with an explicit budget message; later stages didn't run.

- **Check**: `cost-log.jsonl` for outlier entries; compare today's input volume to recent "normal" days.
- **Fix**: narrow the query or filter inputs, or raise the cap deliberately (document the decision). Never disable the cap — it's the last line of defense.

#### P8 — SQLite data missing after restart

**Symptom**: user submissions and past evidence gone after a deploy or restart.

- **Check**: `SQLITE_PATH` points to a persistent volume, not ephemeral container storage.
- **Fix**: mount a persistent volume, set `SQLITE_PATH`, restore from your most recent backup. Going forward, run `sqlite3 "$SQLITE_PATH" ".backup …"` on a schedule.

#### P9 — Docs panel shows stale or missing pages

**Symptom**: in-app Docs panel is empty, or shows template placeholder text.

- **Check**: `curl /api/docs/index` — is the `pages` array present and non-empty? Does it contain `_template.page` or any other file it shouldn't?
- **Fix**: ensure the deploy includes `product_docs/`. If stub template pages surface, the index filter isn't excluding `_`-prefixed files; update `utils/productDocs.js` to match the validator's exclusions and redeploy.

#### P10 — Report scores look implausible

**Symptom**: a component score or confidence value is far from expectation.

- **Check**: walk the evidence trail for that component in the UI. Are there signals that shouldn't be contributing? Is the confidence low (the usual honest signal for thin evidence)?
- **Fix**: if the taxonomy or weight table was recently changed, revert or confirm the change deliberately. If evidence is thin, ingest more sources for that date rather than tuning weights until the number "looks right." See [Scoring model](../concepts/scoring-model.md).

### Rotation drills

Put these on a calendar, don't wait for breakage:

- **WhatsApp access token** — Meta system tokens still expire; rotate quarterly.
- **NewsAPI key** — rotate after any suspected leak or when a team member leaves.
- **Firebase service account key (local only)** — in prod you should be on ADC, so no key to rotate; for local dev, rotate and re-download when convenient.
- **LLM provider keys** — whenever billing, ownership, or seat assignments change.

## Troubleshooting
- **The symptom doesn't match anything listed above**
  - **Check**: run the fast triage sequence to narrow to a stage. Then consult [Common failures](https://docs.srulik.ai/operations/common-failures) and [Observability](https://docs.srulik.ai/operations/observability).
  - **Fix**: if none of those match either, capture logs + symptom + date and escalate.
- **A fix "worked" but I don't know why**
  - **Check**: what *exactly* changed between the failing and succeeding states.
  - **Fix**: write it down before you forget. Undocumented fixes are unrepeatable fixes.
- **The same incident keeps recurring**
  - **Check**: whether the root cause was ever actually fixed, or just worked around.
  - **Fix**: commit a real code/config change. Consider an alert that catches the root-cause signal earlier.
- **I need to roll back a bad deploy**
  - **Check**: whether the persistent SQLite volume survives the rollback (it should — only the code is changing).
  - **Fix**: redeploy the previous commit. Data on the persistent volume is unaffected. Verify with the fast triage sequence.
