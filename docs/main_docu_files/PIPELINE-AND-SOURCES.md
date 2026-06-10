# Pipeline and data sources

**Purpose:** How daily **artifacts** are produced — ingest → signal extraction → **agent assess + shadow scoring** → reports on disk. Operators depend on this pipeline running; they do not run assessment math manually.

**Sources:** `scripts/daily-pipeline.sh`, `pipeline-config.json`, `business_modules/resilience/input/extract-signals.js`, `input/assess-signals.js` (thin CLI wrappers → `app/extractSignalsCli.js`, `app/assessSignalsCli.js`), `app/produceAssessmentWithShadow.js`. Cross-module imports use `business_modules/<name>/index.js` facades — see [README § Module boundaries](./README.md#module-boundaries-option-b).

---

## End-to-end flow

```text
Sources (news, radio, WhatsApp, field, PBO, social, …)
  → normalized markdown / JSON bundles
  → extract-signals (LLM, closed vocabulary)
  → signals-{source}-{date}.json
  → assess-signals
       ├─ verify, scope, prepareScoringSignals
       ├─ scoreComponents (shadow / calibration)
       └─ runAssessmentAgent (RAG + planner + specialists + synthesizer)
  → daily_reports/resilience-report-{date}.json (+ markdown, trace, shadow artifacts)
  → API / operator UI (redacted display tier)
```

Production entry points:

```bash
npm run extract-signals -- --source-type news --files <path> --date YYYY-MM-DD
npm run assess-signals -- --date YYYY-MM-DD [--days N] [--scope national|north|…]
```

Orchestrated daily run:

```bash
./scripts/daily-pipeline.sh
./scripts/daily-pipeline.sh --no-transcribe   # skip radio transcription
```

Worker variant: `npm run worker:assess` → `scripts/workers/assess-signals-worker.js`.

**Degrade:** When daily budget is exceeded or the agent is unavailable, assess continues with deterministic scoring + cached-report fallback (`assessment_degraded` on the report). No legacy Sonnet narrative path.

---

## `scripts/daily-pipeline.sh` (typical steps)

Runs for **today, yesterday, two days ago** (system date):

| Step | Action |
|------|--------|
| 1 | `scripts/radio-transcribe.sh 3` (optional skip) |
| 2 | `npm run homefront-to-md -- $date` → `business_modules/news-sites/articles_extracted/` |
| 3 | `extract-signals.js --source-type news` |
| 4 | `extract-signals.js --source-type radio` on `articles-audio-*` |
| 5 | `whatsapp-to-md.js` + `extract-signals.js --source-type whatsapp` |
| 6 | Last 3 field report MD files → `extract-signals.js --source-type field` |
| 7b | `business_modules/pbo_report_review/input/runMunicipalPboReview.js --date $TODAY` |
| 7 | `extract-pbo-signals.js` (municipal) |
| 8 | `extract-regional-pbo-signals.js` |
| 9 | `extract-naftali-signals.js` |
| 10 | `assess-signals.js --date $TODAY --days 3` |

The shell script runs all steps; **source enablement** for extract/assess is also controlled by `pipeline-config.json`.

---

## `pipeline-config.json`

Per-source toggles: `{ "sources": { "<type>": { "enabled": bool, "description": "…" } } }`.

Keys include: `news`, `radio`, `whatsapp`, `field`, `pbo`, `naftali`, `social`.

- **Extract:** `extract-signals.js` skips disabled sources (`isSourceEnabled`).
- **Assess:** `app/assessSignalsHelpers.js` skips disabled sources when loading bundles.

Status CLI: `npm run pipeline:status`.

---

## Stage 1 — Extract signals

**Entry:** `business_modules/resilience/input/extract-signals.js` (transport) → `app/extractSignalsCli.js`  
**npm:** `npm run extract-signals -- …`

**Inputs:** `--source-type`, `--files` (CSV paths), `--date` (default today).

**Flow:** daily budget check → archive sources to `source_archive` → LLM extraction (Claude) → geo enrich (`enrichSignalsWithGeo.js`) → write bundle.

**Outputs:**

- `business_modules/signals_extraction/data/signals/signals-{type}-{date}.json` (most types)
- Field: `business_modules/visits/data/signals/signals-field-{date}.json`

**Cost script id:** `extract-signals` in `cross-cut-modules/log/data/cost-log.jsonl`.

Optional ingest RAG when `RESILIENCE_EXTRACT_RAG_ENABLED` (see [RAG.md](./RAG.md)).

**Prod cron cost knobs:** set `RESILIENCE_EXTRACT_BATCH=1` for Anthropic Batch API (50% discount, async); sync path remains default elsewhere. Also recommended: `RESILIENCE_EXTRACT_CACHE=1` (default), `RESILIENCE_EXTRACT_MULTIPASS=2` for two-pass extract, `RESILIENCE_EXTRACT_MAX_TOKENS=5000`. See [COST-CONTROLS.md](./COST-CONTROLS.md).

---

## Stage 2 — Assess signals

**Entry:** `business_modules/resilience/input/assess-signals.js` (transport) → `app/assessSignalsCli.js`  
**npm:** `npm run assess-signals -- …`

**Inputs:** `--date`, `--days` (1–14, default 1), `--scope`, `--output`.

**Flow (high level):**

1. Load signal bundles for date window (auto-discover paths including social OSINT).
2. Dedup; attach geo; **`scopeAndPartitionSignals`** (`regionSignalFilter.js`, epistemic partition).
3. **`prepareScoringSignals`** — quarantine, data void, OOV, gaming policy.
4. **`runScoringPipeline`** → `scoreComponents` → epistemic gate → EWMA (`scoringPipelinePrep.js`) — **shadow path**.
5. **`produceAssessmentWithShadow`** → epistemic profile → **`runAssessmentAgent`** (default) or **deterministic degrade** / cached fallback.
6. `mapAssessmentV2ToLegacy`; write JSON/MD report; shadow/divergence artifacts (via `resilience_assessment` adapter); validation queue upsert; domain events.

**Outputs:**

- `daily_reports/resilience-report-{date}.json` (and scoped variants) — includes v2 agent fields + legacy-mapped narratives
- `daily_reports/shadow-scores-{scopeId}-{date}.json` — deterministic scores (`RESILIENCE_SHADOW_SCORING=1`, default on); written by `writeShadowArtifacts` in `business_modules/resilience_assessment/infrastructure/adapters/shadowArtifactsFileAdapter.js` (orchestrated from `produceAssessmentWithShadow.js`)
- `daily_reports/divergence-{scopeId}-{date}.json` — shadow vs agent comparison
- `daily_reports/epistemic-profile-{scopeId}-{date}.json` — epistemic profile snapshot (`epistemicFeaturesService.persistProfile`)
- `daily_reports/assessment-agent-trace-{traceId}.jsonl` — per-assess agent audit trail
- Markdown report paths as configured
- SQLite validation review queue (default unless `VALIDATION_REVIEW_SQLITE=0`)

**Cost script id:** `assess-signals` (includes agent LLM rounds under assess budget governor).

Full stage detail: [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md).

---

## Source modules (where ingest lives)

| Source | Module / script |
|--------|-----------------|
| News | `business_modules/news-sites/` — `homefront-to-md` |
| Radio / audio | `business_modules/audio/`, `scripts/radio-transcribe.sh` |
| WhatsApp (groups) | `business_modules/whatsapp/input/whatsapp-to-md.js` — passive group export → extract |
| WhatsApp (DM Report bot) | Same guided flow as Write report — [§ Guided report](#guided-report-write-report--whatsapp-dm) |
| Field visits | `business_modules/visits/data/` |
| PBO municipal / regional | `business_modules/pbo_report_muni/`, `business_modules/pbo_report_regional/` |
| Naftali / pools | `business_modules/pool/` |
| Social OSINT | `business_modules/social_media/data/` |

Geographic scoping for regional reports: [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md).

---

## Guided report (Write report + WhatsApp DM)

Structured situational reports use one **`report_build`** orchestrator for two surfaces:

| Surface | Entry | Session key |
|---------|-------|-------------|
| **Write report (web)** | Header button → `ReportBuildPanel.jsx` | Firebase `request.user.uid` |
| **WhatsApp Report bot (DM)** | `POST /api/webhooks/whatsapp` → `handleDmMessage` | Sender phone |

**API (web):** `POST /api/report-build/start`, `/turn`, `/suggest`, `/confirm`, `/cancel` — `business_modules/report_build/input/reportBuildRoutes.js`.

**Flow:** officer turns → `reportBuildService` (gap engine + LLM draft) → confirm → **`source_archive`** (`report_build-web` or `field_whatsapp` labels).

**WhatsApp groups** are **not** the guided bot: approved group messages → passive ingest → `whatsapp-to-md` → `extract-signals --source-type whatsapp` (same row as groups in the table above).

**Wiring:** `composition/registerMedia.js` registers web routes and a WhatsApp-scoped `reportBuildService` when Meta env vars are set. Requires `ANTHROPIC_API_KEY`.

---

## Artifacts operators rely on

| Path | Role |
|------|------|
| `daily_reports/resilience-report-*.json` | Full assessment — agent v2 fields + legacy-mapped narratives; shadow scores on disk; API redacts for operators |
| `daily_reports/shadow-scores-{scopeId}-*.json` | Deterministic calibration scores (analyst; `RESILIENCE_SHADOW_SCORING=1`) |
| `daily_reports/divergence-{scopeId}-*.json` | Shadow vs agent divergence (`GET /api/report/divergence`, analyst) |
| `daily_reports/epistemic-profile-{scopeId}-*.json` | Epistemic profile snapshot per scope/date |
| `daily_reports/assessment-agent-trace-*.jsonl` | Agent step replay (analyst) |
| `business_modules/signals_extraction/data/signals/signals-{type}-*.json` | Extracted signals per source/day (field: `business_modules/visits/data/signals/signals-field-*.json`) |
| `business_modules/news-sites/articles_extracted/` | News markdown exports |
| SQLite `source_archive` | Original source text for chat `get_source` and assess-time RAG |
| SQLite validation queue | Analyst review of extraction quality |

Deploy must include product pages (`cross-cut-modules/docs/content/pages/`) and these data dirs for a functioning operator experience.

---

## Signal catalog evolution (analyst, post-extract)

During **extract**, optional OOV learning capture writes `daily_reports/oov-capture-{date}.jsonl` when `RESILIENCE_OOV_CAPTURE=1` (unknown types, self-check uncertain, zero-signal articles; optional residual observations when `RESILIENCE_RESIDUAL_CAPTURE=1`).

**Module:** `business_modules/signal_catalog_evolution/` — clusters captures, generates gap reports, and stores human-reviewed draft catalog proposals (SQLite `catalog_proposals`). Does **not** change daily scores; OOV/residual may feed **investigation** when Tier 2 flags enabled.

```bash
npm run signal-catalog-evolution:gap-report
npm run rag:reindex-catalog
```

**API (analyst):** `/api/signal-catalog-evolution/proposals*` — see [COST-CONTROLS.md](./COST-CONTROLS.md).

---

## Related docs

- Operator UI: [SYSTEM-AND-OPERATOR-MODEL.md](./SYSTEM-AND-OPERATOR-MODEL.md)
- Assessment agent + shadow scoring: [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md)
- RAG reindex after deploy: [RAG.md](./RAG.md)
- Agent env flags: [docs/MODEL-CARD.md](../MODEL-CARD.md)
