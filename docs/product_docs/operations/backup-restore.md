---
title: "Backup and restore"
description: "SQLite and evidence upload backup drills for production ops."
intent: operations
audience: ["internal"]
stability: beta
tags: ["backup", "sqlite", "dr"]
---

## Purpose

Quarterly restore drills ensure SQLite and uploaded evidence can be recovered after VM failure or operator error.

## Backup script

```bash
chmod +x scripts/backup-db.sh
./scripts/backup-db.sh                    # writes db/backups/backup-<UTC>.tar.gz
./scripts/backup-db.sh /mnt/backups/news  # custom output directory
```

Env overrides:

- `SQLITE_PATH` — default `db/app.sqlite`
- `EVIDENCE_UPLOADS_ROOT` — default `db/evidence-uploads`

Archive contents:

- `app.sqlite` — consistent copy via `sqlite3 .backup`
- `evidence-uploads/` — directory tree copy

Schedule on the VM (example cron, daily 02:00 UTC):

```bash
0 2 * * * cd /path/to/news && ./scripts/backup-db.sh /mnt/backups/news >> /var/log/news-backup.log 2>&1
```

Copy archives off-box (GCS bucket, another region) — the script only creates local tarballs.

## Restore drill (quarterly)

1. Pick a recent `backup-*.tar.gz` from off-box storage.
2. Restore to a **temp directory**, not production:

   ```bash
   mkdir -p /tmp/news-restore && tar -xzf backup-YYYYMMDD.tar.gz -C /tmp/news-restore
   ```

3. Verify row counts:

   ```bash
   sqlite3 /tmp/news-restore/app.sqlite "SELECT COUNT(*) FROM evidence_items;"
   sqlite3 /tmp/news-restore/app.sqlite "SELECT COUNT(*) FROM source_archive;"
   ```

4. Spot-check a few `evidence-uploads` files exist and match expected sizes.
5. Log drill date and outcome in your ops runbook.

## Production cutover (emergency only)

1. Stop the Node process (PM2 / systemd).
2. Replace `db/app.sqlite` and `db/evidence-uploads/` from backup.
3. Confirm `SQLITE_PATH` points at restored DB.
4. Start server; hit `/api/monitoring/health/detail` as analyst.

## Related

- [Edge security](./edge-security.md)
