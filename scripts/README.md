# Pipeline Scripts

Shell scripts and repo-level tooling for scheduled runs, CI, and SonarCloud workflows.  
Domain-specific CLIs live under `business_modules/*/input/` (or `cross-cut-modules/geo/input/` for composition entries).

## Scripts

### `radio-transcribe.sh` — Transcribe missing recordings

Finds radio recordings that don't have a corresponding `.md` transcript and transcribes them.

```bash
# Today's recordings only
./scripts/radio-transcribe.sh

# Last 3 days
./scripts/radio-transcribe.sh 3

# Specific date
./scripts/radio-transcribe.sh 2026-04-08
```

- Reads MP3s from `business_modules/scheduled_stream_capture/data/` (override with `RECORDINGS_DIR`)
- Automatically skips recordings that already have a transcript file
- Matches each recording to its program name from the recording jobs DB
- Uses `--contextualize` (LLM filtering of ads/music)
- Uses `--whisper` for non-Hebrew stations

### `daily-pipeline.sh` — Full 3-day resilience pipeline

Runs the complete pipeline via unified orchestrator (equivalent to `/8comp-3`):

```bash
./scripts/daily-pipeline.sh
# or: npm run pipeline:run -- --preset 8comp-3
```

## Running on the GCP VM

### Option A: One-time manual run

SSH into the VM and run directly:

```bash
ssh your-vm
cd ~/news
./scripts/daily-pipeline.sh
```

To run in background (survives SSH disconnect):

```bash
nohup ./scripts/daily-pipeline.sh > cross-cut-modules/log/data/pipeline-$(date +%Y-%m-%d).log 2>&1 &
```

### Option B: Scheduled via cron (two-window, recommended)

The officer produces two briefings per day — morning and afternoon. Run the pipeline twice to ensure each briefing uses fresh data.

Edit crontab on the VM:

```bash
crontab -e
```

Add two daily runs — morning (06:00) and afternoon (14:00) Israel time:

```cron
# Morning pipeline — 06:00 Israel time (UTC+3 = 03:00 UTC; UTC+2 summer = 04:00 UTC)
0 3 * * 0-4  cd /home/eventstorm1/news && source .env && ./scripts/daily-pipeline.sh --no-transcribe >> cross-cut-modules/log/data/pipeline-morning.log 2>&1

# Afternoon pipeline — 14:00 Israel time (11:00 UTC winter / 12:00 UTC summer)
0 11 * * 0-4  cd /home/eventstorm1/news && source .env && ./scripts/daily-pipeline.sh >> cross-cut-modules/log/data/pipeline-afternoon.log 2>&1
```

Notes:
- Schedule `0-4` = Sunday–Thursday (Israeli work week). Add `,5,6` to also run Friday–Saturday if the officer is on duty.
- Morning run uses `--no-transcribe` because radio recordings are still being captured at 06:00. The afternoon run includes transcription.
- Choose times that clear your recording job windows (check `business_modules/radio/input/setup-tzafon.js` for recording hours).
- The report cache always picks the most recent run for a given day, so back-to-back runs are safe.
- If data is older than 4 hours when the officer opens the UI, a freshness banner is shown automatically.
- Log output goes under `cross-cut-modules/log/data/` (created automatically on first write).

**Weekend coverage:** if the officer needs weekend reports, add days 5 (Friday) and 6 (Saturday) to the schedule, or run manually:
```bash
./scripts/daily-pipeline.sh
```

### Option C: Via PM2 (two-window)

Add two entries to `ecosystem.config.cjs`:

```javascript
{
  name:          'pipeline-morning',
  script:        'scripts/daily-pipeline.sh',
  args:          '--no-transcribe',
  cwd:           __dirname,
  cron_restart:  '0 3 * * 0-4',    // 06:00 Israel time (winter, UTC+3)
  autorestart:   false,
  env: { NODE_ENV: 'production' },
},
{
  name:          'pipeline-afternoon',
  script:        'scripts/daily-pipeline.sh',
  cwd:           __dirname,
  cron_restart:  '0 11 * * 0-4',   // 14:00 Israel time (winter, UTC+3)
  autorestart:   false,
  env: { NODE_ENV: 'production' },
},
```

Then: `pm2 start ecosystem.config.cjs` (or `pm2 reload ecosystem.config.cjs` if already running).

## Environment

The scripts require the same environment as the app:
- `OPENAI_API_KEY` — for radio transcription
- `ANTHROPIC_API_KEY` — for signal extraction and assessment
- `.env` file in the project root (loaded by `dotenv`)

If running via cron, make sure the env vars are available. Easiest way:

```bash
# In crontab, source the env file before running
0 12 * * 0-4  cd /home/eventstorm1/news && source .env && ./scripts/daily-pipeline.sh >> cross-cut-modules/log/data/pipeline-cron.log 2>&1
```

## Monitoring

Check the latest pipeline run:

```bash
# If using two-window cron
tail -50 ~/news/cross-cut-modules/log/data/pipeline-morning.log
tail -50 ~/news/cross-cut-modules/log/data/pipeline-afternoon.log

# If using PM2
pm2 logs pipeline-morning --lines 50
pm2 logs pipeline-afternoon --lines 50
```

Check if today's report was generated:

```bash
ls -la daily_reports/resilience-report-$(date +%Y-%m-%d)*.json
```

## Degraded mode

When the LLM specialist call fails during assessment, the pipeline degrades gracefully rather than crashing:

- **Keyword fallback (`assessment_mode: 'keyword'`)** — the open path routes observations via keyword matching instead of LLM routing. Reports are still produced but open-path narrative quality is reduced. The UI shows a **warning banner**.
- **Abstention (`assessment_mode: 'abstained'`)** — no viable signal-based report; the output contains only `data_void` metadata and attention items. The UI shows a **pulsing red error banner** (visually distinct from warnings) to alert the officer.

In either case:
1. Check `stderr` in the pipeline log for `specialist_failed` or `assessment_degraded`.
2. Inspect `assessment.shadow_scoring.assessment_mode` in the JSON report.
3. The officer should treat the report as advisory and seek field corroboration.

## Troubleshooting

**Transcription fails for a specific recording**  
The script continues to the next recording. Check the output for `FAILED` lines. Common causes:
- OpenAI API rate limits (retries built into the adapter, but long recordings may exceed)
- Corrupted MP3 (ffprobe will fail)

**Signal extraction fails for a date**  
The script logs a WARNING and continues. Missing signals for one date won't block the assessment — other dates still contribute.

**Assessment fails**  
Usually means no signal files exist at all. Check `ls signals/signals-*-$(date +%Y-%m-%d).json`.

## Other tooling (same folder)

| Path | Purpose |
|---|---|
| `docs/validate-docs.js`, `docs/sync-overarching-docs.js` | Product docs validation and sync (`npm run docs:check`, `docs:sync`) |
| `ci-audit.mjs`, `check-node-engines.mjs`, `audit-dependencies.mjs` | CI and dependency hygiene |
| `sonar/*.mjs` | SonarCloud issue queue and `/fix-sonar` loop (`npm run sonar:*`) |
