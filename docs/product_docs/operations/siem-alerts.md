---
title: "SIEM and alerting"
description: "Log fields and example alert policies for VM and Cloud Run."
intent: operations
audience: ["internal"]
stability: beta
tags: ["siem", "logging", "alerts"]
---

## Purpose

Structured signals for auth failures, rate limits, budget caps, and audit events — same queries work on **GCP VM (Ops Agent → Cloud Logging)** and **Cloud Run (native logging)**.

## Log sources

| Source | Path / stream | Format |
|--------|---------------|--------|
| App stdout | PM2 / Cloud Run logs | text (Fastify errors, webhook failures) |
| Cost telemetry | `cross-cut-modules/log/data/cost-log.jsonl` | JSONL |
| Audit trail | `cross-cut-modules/log/data/audit.jsonl` | JSONL |
| Auth failures | HTTP 401 responses | access log if enabled at proxy |

Audit JSONL schema:

```json
{ "ts", "userEmail", "uid", "action", "resource", "ip", "meta" }
```

Instrumented actions include: `evidence.submit`, `evidence.upload`, `chat.post`, `translate.post`, `social.fetch_topic`, `validation.decision`, `auth.users.list`.

## VM — Google Cloud Ops Agent

Install Ops Agent on the VM and tail:

- `/path/to/news/cross-cut-modules/log/data/audit.jsonl`
- `/path/to/news/cross-cut-modules/log/data/cost-log.jsonl`

Create **log-based metrics** in Cloud Logging, e.g.:

```
resource.type="gce_instance"
jsonPayload.action="social.fetch_topic"
```

## Example alert policies

### 401 spike (possible credential stuffing)

```
textPayload=~"401" OR jsonPayload.statusCode=401
```

Threshold: > 50 events / 5 min per instance.

### Rate limit 429 burst

```
jsonPayload.statusCode=429 OR textPayload=~"Too Many Requests"
```

Threshold: > 100 / 10 min — tune per traffic.

### Maintainer / costly actions (audit)

```
jsonPayload.action=("social.fetch_topic" OR "evidence.submit" OR "chat.post")
```

Anomaly: count > 3× 7-day baseline for same `uid`.

### Cost log outlier

Parse `cost-log.jsonl` for `totalCostUsd` > daily budget env (`BUDGET_*` in cross-cut-modules/budget).

### Probe HMAC rejections

App logs or resilience ingest: `missing_hmac_secret`, `hmac_mismatch` in probe validation.

## Cloud Run

Same Logging filters — `resource.type="cloud_run_revision"`. Export audit JSONL to GCS via scheduled job if long retention is required (Cloud Run disks are ephemeral).

## Related

- [Edge security](./edge-security.md)
- [Deploy](../getting-started/deploy.md)
