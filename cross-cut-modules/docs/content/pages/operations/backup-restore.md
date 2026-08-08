---
title: "Backup and restore"
description: "SQLite and evidence upload backup drills for production ops."
intent: operations
audience: ["internal"]
stability: beta
tags: ["backup", "sqlite", "dr"]
---

## Purpose

Quarterly restore drills ensure SQLite and uploaded evidence can be recovered after VM failure or user error.

## Prerequisites

- SSH access to the production VM (or restore host).
- `sqlite3` CLI installed for verification queries.
- Off-box storage for `backup-*.tar.gz` archives (GCS or equivalent).

## Inputs

- `SQLITE_PATH` — default `db/app.sqlite`
- `EVIDENCE_UPLOADS_ROOT` — default `db/evidence-uploads`
- A recent `backup-*.tar.gz` from `scripts/backup-db.sh`

## Outputs

- Timestamped archive: `db/backups/backup-<UTC>.tar.gz` (or custom directory)
- Drill log entry: date, archive id, row counts, pass/fail

## Constraints

- Never restore directly over production without stopping the Node process first.
- Backups are point-in-time; WAL mode means use `sqlite3 .backup` (script does this).
- Evidence uploads can be large — ensure disk space before running on-VM backups.

## Examples

### Backup script

```bash runnable
test -x scripts/backup-db.sh && echo "backup script present"
```

Expected: `backup script present`

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh                    # writes db/backups/backup-<UTC>.tar.gz
./scripts/backup-db.sh /mnt/backups/news  # custom output directory
```

Archive contents:

- `app.sqlite` — consistent copy via `sqlite3 .backup`
- `evidence-uploads/` — directory tree copy

Schedule on the VM (example cron, daily 02:00 UTC):

```bash
0 2 * * * cd /path/to/news && ./scripts/backup-db.sh /mnt/backups/news >> /var/log/news-backup.log 2>&1
```

Copy archives off-box (GCS bucket, another region) — the script only creates local tarballs.

### Restore drill (quarterly)

1. Pick a recent `backup-*.tar.gz` from off-box storage.
2. Restore to a **temp directory**, not production:

   ```bash
   mkdir -p /tmp/news-restore && tar -xzf backup-YYYYMMDD.tar.gz -C /tmp/news-restore
   ```

3. Verify row counts:

   ```bash runnable
   sqlite3 /tmp/news-restore/app.sqlite "SELECT COUNT(*) FROM evidence_items;" 2>/dev/null || echo "run after restore"
   ```

   Expected: a non-negative integer after a real restore; on a fresh drill host without a restore, the message reminds you to run post-restore.

4. Spot-check a few `evidence-uploads` files exist and match expected sizes.
5. Log drill date and outcome in your ops runbook.

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `backup-db.sh` permission denied | `chmod +x scripts/backup-db.sh` |
| Archive empty or tiny | `SQLITE_PATH` points at the live DB; disk full |
| Restore sqlite errors | Extract to empty dir; do not overwrite running `db/app.sqlite` while app is up |
| Row counts zero after restore | Wrong tarball or corrupt download — re-fetch from off-box storage |

## Production cutover (emergency only)

1. Stop the Node process (PM2 / systemd).
2. Replace `db/app.sqlite` and `db/evidence-uploads/` from backup.
3. Confirm `SQLITE_PATH` points at restored DB.
4. Start server; hit `/api/monitoring/health/detail` as developer.

## Related

- [Edge security](./edge-security.md)
