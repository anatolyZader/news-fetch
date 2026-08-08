#!/usr/bin/env node
/**
 * Unified resilience pipeline transport entry (`npm run pipeline:run`, /8comp-3, cron).
 *
 * **Owns:** bootstrap (dotenv, state store), `--help` text, CLI exit handling only.
 *
 * **Pipeline position:** thin wrapper over `app/pipeline/pipelineOrchestrator.js`.
 *
 * **Inputs:** positional date + flags (`--preset`, `--date`, `--days`, `--scope`,
 * `--always-reextract`, `--force`, `--ingest-only`, `--assess-only`, `--plan-only`, …).
 *
 * **Outputs:** exit 0 on success; delegates artifact writes to spawned assess/extract scripts.
 *
 * **Does NOT:** implement ingest planning, extraction, or assessment logic.
 *
 * **Collaborators:** `pipelineOrchestrator`, `pipelinePresets`.
 *
 * Usage:
 *   npm run pipeline:run -- [--preset 8comp-3|8comp-3-north|…] [date] [options]
 *   node run-pipeline.js --date 2026-04-15 --scope north --always-reextract
 */
import 'dotenv/config';
import { bootstrapDefaultStateStore } from '../../../cross-cut-modules/persistence/bootstrapStateStore.js';

bootstrapDefaultStateStore();

import { parsePipelineCliArgs, runPipelineOrchestrator } from '../app/pipeline/pipelineOrchestrator.js';
import { PIPELINE_PRESETS } from '../app/pipeline/pipelinePresets.js';

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  const presetList = Object.keys(PIPELINE_PRESETS).join(', ');
  console.log(`Usage: run-pipeline.js [date] [options]

Date: dd:mm:yyyy, dd/mm/yyyy, or YYYY-MM-DD (default: today Asia/Jerusalem)

Options:
  --preset <name>       ${presetList}
  --date <YYYY-MM-DD>   Target assessment date
  --days <N>            Assessment window (default 3, max 14)
  --scope <id>          national | north | south | … (default national)
  --always-reextract    Never reuse cached signal bundles when source .md exists
                        (visits excluded — see RESILIENCE_VISITS_REEXTRACT_HOLD)
  --force               Re-fetch source .md and re-gather social where applicable
  --no-transcribe       Skip radio transcription (today mode only)
  --no-social           Skip social OSINT gather
  --ingest-only         Run ingest steps only
  --assess-only         Skip ingest; run assess-signals only
  --plan-only           Print ingest plan and exit (no API calls, no extraction)

Env:
  RESILIENCE_ALWAYS_REEXTRACT=1   Same as --always-reextract
  RESILIENCE_VISITS_REEXTRACT_HOLD=0   Let --always-reextract re-extract visits again
                                       (default: held — visits reuse existing bundles)
  RESILIENCE_OPEN_EXTRACT_PARALLEL=1   Set automatically when unset
  RESILIENCE_REPLAY_REUSE_NEWS=1  Reuse cached bundles on dated replay (preset 8comp-north-replay sets defaults)
  RESILIENCE_REPLAY_REUSE_WHATSAPP=1 / RESILIENCE_REPLAY_REUSE_PBO=1 / RESILIENCE_REPLAY_REUSE_VISITS=1
  RESILIENCE_NARRATIVE_FACTS_MAX_TOKENS=12000 / RESILIENCE_NARRATIVE_JUDGE_MAX_TOKENS=8000
  RESILIENCE_NARRATIVE_CONTEXT_MAX_TOKENS=180000   Preflight ceiling per narrative LLM call
  RESILIENCE_NARRATIVE_CHARS_PER_TOKEN=3.5         Token estimator for preflight
  RESILIENCE_NARRATIVE_DIGEST_SIGNALS=15           Digest cap per component (ladder may lower)
  RESILIENCE_NARRATIVE_DIGEST_EVIDENCE_CHARS=500   Evidence trim in digest
  RESILIENCE_NARRATIVE_FACTS_SHARD_SIZE=4          Haiku facts shard width
  RESILIENCE_NARRATIVE_PIPELINE=hybrid             Set legacy for monolithic Sonnet Step 2
  RESILIENCE_NARRATIVE_GROUNDING_BLOCK=1   Fail assess when grounding mean < min (analyst replays only)
  RESILIENCE_CLOSED_CORE_ASSESS=0   Enable assessment agent on replay (default 1)
  npm run pipeline:audit -- --date YYYY-MM-DD --scope north   Post-run digest
`);
  process.exit(0);
}

try {
  const opts = parsePipelineCliArgs(argv);
  await runPipelineOrchestrator(opts);
} catch (err) {
  console.error('run-pipeline failed:', err?.message ?? err);
  process.exit(1);
}
