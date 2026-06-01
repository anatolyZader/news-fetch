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

- Reads MP3s from `business_modules/recording/data/` (override with `RECORDINGS_DIR`)
- Automatically skips recordings that already have a transcript file
- Matches each recording to its program name from the recording jobs DB
- Uses `--contextualize` (LLM filtering of ads/music)
- Uses `--whisper` for non-Hebrew stations

### `daily-pipeline.sh` — Full 3-day resilience pipeline

Runs the complete pipeline equivalent to the `/8comp-3` slash command:

1. Transcribe missing radio recordings (last 3 days)
2. Fetch news articles for each of the 3 days
3. Extract signals from news, radio, WhatsApp, field reports, PBO, and Naftali
4. Run the combined 3-day resilience assessment

```bash
# Full pipeline
./scripts/daily-pipeline.sh

# Skip transcription (if recordings are already transcribed)
./scripts/daily-pipeline.sh --no-transcribe
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

### Option B: Scheduled via cron

Edit crontab on the VM:

```bash
crontab -e
```

Add a daily run at 15:00 Israel time (12:00 UTC in winter, 13:00 UTC in summer):

```cron
# Daily resilience pipeline — runs at 15:00 Israel time (UTC+3)
0 12 * * 0-4  cd /home/eventstorm1/news && ./scripts/daily-pipeline.sh >> cross-cut-modules/log/data/pipeline-cron.log 2>&1
```

Notes:
- Schedule `0-4` = Sunday–Thursday (Israeli work week)
- Choose a time after all recordings finish (check your recording jobs schedule)
- Log output goes under `cross-cut-modules/log/data/` (created automatically on first write)

### Option C: Via PM2

Add to `ecosystem.config.cjs` as a one-shot process with a cron restart:

```javascript
{
  name:          'daily-pipeline',
  script:        'scripts/daily-pipeline.sh',
  cwd:           __dirname,
  cron_restart:  '0 12 * * 0-4',   // 15:00 Israel time
  autorestart:   false,             // don't restart after completion
  env: {
    NODE_ENV: 'production',
  },
}
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
# If using cron
tail -100 ~/news/cross-cut-modules/log/data/pipeline-cron.log

# If using PM2
pm2 logs daily-pipeline --lines 100
```

Check if today's report was generated:

```bash
ls -la daily_reports/resilience-report-$(date +%Y-%m-%d)*.json
```

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
| `ci-sonar-review-hotspots.mjs` | CI Sonar hotspot triage |
| `sonar/*.mjs` | SonarCloud issue queue and `/fix-sonar` loop (`npm run sonar:*`) |
