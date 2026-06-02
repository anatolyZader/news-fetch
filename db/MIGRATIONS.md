# SQLite migrations

## Principles

1. **Expand then contract** — add nullable columns first; backfill; enforce; remove old paths later.
2. **Idempotent DDL** — prefer `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and guarded `ALTER` patterns (see WhatsApp draft store column adds).
3. **Version** — track `PRAGMA user_version` when introducing breaking schema changes.
4. **Deploy order** — migration → code that reads new columns → code that writes required fields → constraint enforcement.

## Rollback

- Keep the previous code path readable for one release when dropping columns.
- Never drop columns in the same release that stops writing them.
