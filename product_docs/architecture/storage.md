---
title: "Storage model (SQLite)"
description: "What is stored, where it lives, and how persistence interacts with workflows."
intent: architecture
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/architecture/storage"
version: "current"
tags: ["architecture", "storage"]
---

## Purpose
Explain what VibeSwitch persists, where those bytes live, how persistence interacts with ingestion and analysis, and what operators need to know to keep data safe across restarts and deploys. Understanding the storage model is prerequisite for productionizing the app.

## Prerequisites
- **Required**: Understanding that SQLite is a single-file database served in-process by the application. There is no separate database daemon.
- **Useful**: Familiarity with the overall [System overview](system-overview.md).

## Inputs
- **Evidence items**: news articles, WhatsApp messages, transcripts, manual submissions.
- **Drafts and submissions**: content created by the app (e.g., post drafts from WhatsApp ingestion) and user-contributed evidence.
- **Pipeline artifacts**: some intermediate records (depending on module) also live in the DB for fast UI reads.

## Outputs
- **Persisted rows** in SQLite with provenance (source type, URL or message ID, timestamp).
- **File-backed artifacts** on disk for things that aren't best represented as rows: dated markdown exports, signals JSON, assessment reports. The DB and the filesystem both matter.

## Constraints
- **Single writer.** SQLite's locking is process-local — don't run two servers against the same file. Horizontal scale requires migrating off SQLite (not covered here).
- **Path is configurable via `SQLITE_PATH`.** Default is a path under the repo root. In production, always override it to a real persistent volume.
- **Backups are your responsibility.** Copy the SQLite file periodically (rsync / platform snapshot). The safest way is to temporarily pause writes or use SQLite's online backup API; a plain `cp` of a busy file can produce a corrupted copy.
- **Don't mix DB and code deploys.** Schema migrations should ship deliberately, not as an accidental side-effect of code that assumes new columns.
- **Don't treat the DB as truth for the pipeline.** Dated markdown exports and signals JSON are the replayable truth; SQLite is the fast-read layer the UI queries. If the two disagree, the dated artifacts win.

## What lives where

| Data | Storage | Notes |
|---|---|---|
| Evidence items | SQLite | Normalized rows with provenance |
| WhatsApp messages | SQLite | Stored as received, with media references |
| User submissions | SQLite | Manual evidence from the UI |
| Drafts | SQLite | Optional; only populated if draft generation is enabled |
| Reports (today, per date) | Filesystem (`reports/`) + cache | JSON/MD artifacts served via API |
| Signals (per source, per date) | Filesystem (`signals/`) | `signals-<source>-YYYY-MM-DD.json` |
| Source exports | Filesystem (`business_modules/*/articles_extracted/` or `reports/`) | Dated markdown |
| Cost log | Filesystem (`cost-log.jsonl`) | Append-only audit |

## Examples

### Point SQLite at a persistent path

```bash runnable
export SQLITE_PATH=/var/lib/vibeswitch/app.sqlite
```

Expected: once set and the server is restarted, all reads and writes go to this file. Make sure the parent directory exists and is writable by the process user.

### Confirm the path the server is using

Check the server startup logs — the path is printed on first write (or on first connection attempt). In a pinch:

```bash runnable
ls -la "${SQLITE_PATH:-./app.sqlite}" 2>/dev/null || echo "file not yet created"
```

Expected: either the file's size and mtime, or a hint that it hasn't been created yet (the server creates it lazily on first write).

### Back up safely

Two options in order of preference:

1. Use SQLite's `.backup` command, which is safe while the DB is active:
   ```bash
   sqlite3 "$SQLITE_PATH" ".backup /backups/app-$(date +%F).sqlite"
   ```
2. Briefly pause writes (stop the server or quiesce ingestion), then `cp` and restart.

A naïve `cp` of a busy SQLite file can capture a mid-write snapshot and produce a corrupted backup. Don't skip this detail.

### Point two environments at the same path (don't)

```bash
# DO NOT DO THIS
SQLITE_PATH=/shared/vibeswitch.sqlite npm run start   # on host A
SQLITE_PATH=/shared/vibeswitch.sqlite npm run start   # on host B
```

Two writers against the same SQLite file produces sporadic `SQLITE_BUSY` errors and, eventually, corruption. If you need multi-writer, move off SQLite.

## Troubleshooting
- **Data disappears after every restart**
  - **Check**: whether the container has ephemeral storage (writable layer, no volume).
  - **Fix**: mount a persistent volume and point `SQLITE_PATH` at a file inside it. Confirm with a deliberate restart.
- **Ingestion looks successful but the UI shows nothing**
  - **Check**: the server is pointing at the same `SQLITE_PATH` you expect — misconfigured env is the most common cause.
  - **Fix**: standardize env across deployments and verify the file path exists with the right permissions.
- **`SQLITE_BUSY` errors during heavy pipeline runs**
  - **Check**: whether two processes are hitting the DB at once (e.g., a long CLI while the server is also writing).
  - **Fix**: serialize heavy writes or route them through the server's own endpoints rather than opening the DB directly from a CLI.
- **DB file is larger than expected**
  - **Check**: whether old ingestion runs are piling up without pruning.
  - **Fix**: add a retention policy (time-boxed pruning) for evidence you no longer need. Back up before any destructive cleanup.
- **Schema drift between environments**
  - **Check**: whether both environments ran the same code version after the schema last changed.
  - **Fix**: ship schema migrations deliberately in a dedicated step; never rely on "the code will create missing columns lazily."
- **I want Postgres/MySQL**
  - **Check**: whether you actually need it (multi-writer, cross-region). For single-node deployments SQLite is usually fine.
  - **Fix**: swapping the DB is a real migration, not a config change. Out of scope for this page — open an issue before starting.
