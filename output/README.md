# output/ — centralized artifact view

Symlinks only. **Canonical storage stays module-owned** under `business_modules/*/data/`, `business_modules/resilience_scorer/analyst/data/`, and `logs/`. This tree is for browsing and operator access without moving pipeline paths.

Regenerate after clone:

```bash
npm run output:setup
```

## Layout

| Link | Canonical target | Contents |
|------|------------------|----------|
| **production/** | | Operator daily pipeline |
| `assessment-reports/` | `business_modules/resilience_scorer/data/daily_reports/` | Assessment JSON, MD, brief (override dir: `REPORTS_DIR`) |
| `closed-signals/` | `business_modules/resilience_scorer/data/signals/` | `signals-{source}-{date}.json` (closed catalogue) |
| `open-observations/` | `business_modules/open_observation_extraction/data/` | Open-path observation bundles |
| `oov-captures/` | `business_modules/resilience_scorer/data/oov_captures/` | Out-of-vocabulary capture JSONL |
| `omission-audits/` | `business_modules/resilience_scorer/data/omission_audits/` | Omission audit JSON |
| `epistemic-profiles/` | `business_modules/resilience_scorer/data/epistemic_profiles/` | Epistemic profile snapshots |
| `agent-traces/` | `business_modules/specialist_agents/data/traces/` | Assessment agent trace JSONL |
| `agent-eval/` | `business_modules/specialist_agents/data/eval/` | Agent eval artifacts |
| `ingest/news-articles/` | `business_modules/news-sites/articles_extracted/` | News MD exports |
| `ingest/whatsapp-reports/` | `business_modules/whatsapp/reports/` | WhatsApp daily MD |
| `ingest/field-visits/` | `business_modules/visits/data/` | Field visit MD + signals |
| `ingest/pbo-muni/` | `business_modules/pbo_report_muni/data/` | Municipal PBO exports |
| `ingest/pbo-regional/` | `business_modules/pbo_report_regional/data/` | Regional PBO data |
| `ingest/social-media/` | `business_modules/social_media/data/` | Social signals and fetches |
| **research/** | | Calibration — not auto-served to operators |
| `translation-locale/` | `business_modules/translation/data/locale/` | Translation locale cache |
| **operational/** | | Logs and cost (ephemeral / audit) |
| `logs/` | `logs/` | Pipeline run logs, extract traces |
| `cost/` | `cross-cut-modules/log/data/` | Token cost audit JSONL |

## Path helpers (code)

Do not hardcode `output/` in application code. Use existing resolvers:

- `business_modules/resilience_scorer/domain/services/paths/outputDirs.js`
- `business_modules/resilience_scorer/domain/services/paths/ingestPaths.js`
- `cross-cut-modules/resilience-contracts/closedSignalsPaths.js`
- `business_modules/resilience_scorer/analyst/domain/services/artifactPaths.js`
- `business_modules/specialist_agents/domain/services/artifactPaths.js`

Symlink definitions: `scripts/setup-output-symlinks.js` (`OUTPUT_SYMLINKS`).

## Not included

- **SQLite / evidence DB** (`SQLITE_PATH`) — not filesystem reports
- **report_bot** / **report_build** — separate manual/reporting flows (see `docs/updated_main_docs/06-REPORTS-DELIVERY-AND-CHAT.md`)
- **Module temp caches** (video, search trends, etc.) — different retention; stay under each module
