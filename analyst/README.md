# Analyst quarantine

Headline `/10` scoring, CI/calibration, validation, tuning, drift, and shadow divergence live here — **not** operator daily work.

## Operator platform (do not move here)

- Ingest, epistemic hygiene, specialists (`business_modules/resilience_assessment/`)
- `business_modules/resilience/domain/epistemic/` — caps, mass contribution, partition
- `componentDiagnostics`, operator UI/API

## Entry points

| Need | Import |
|------|--------|
| Headline scoring from operator pipeline | `business_modules/resilience/app/scoringFacade.js` only |
| Shadow artifacts from assess finalize | `business_modules/resilience/app/shadowFacade.js` only |
| Validation / drift HTTP (composition) | `analyst/index.js` |
| Direct analyst tooling | `analyst/scoring/`, `analyst/validation/`, etc. |

## npm scripts

- `npm run validation:status` / `validation:set-phase`
- `npm run suggest-tuning`
- `npm run golden:build-corpus` / `golden:eval`
- `npm run taxonomy:gap-audit`

## Boundaries

- `analyst/scoring/` may import `business_modules/resilience/domain/epistemic/`
- `business_modules/resilience/**` must not import `analyst/**` except `scoringFacade.js`, `shadowFacade.js`, and the deprecated `validation/index.js` shim
- `client/**` must not import `analyst/**`

## Open evidence (operator pipeline)

Extract runs closed catalogue + parallel open observations (`RESILIENCE_OPEN_EXTRACT_PARALLEL=1` default). **All extractors** write `observations-pipeline-{sourceType}-{date}.json`: MD sources via `extract-signals` / regional PBO dual-path; social after classify/treat; PBO municipal and Naftali from free-text adapter units. Assess loads pipeline bundles separately from closed signals; agent/RAG receives routed open obs (`RESILIENCE_OPEN_OBS_FOR_AGENT=1`). Post-agent verified open claims may add discounted synthetic scoring signals flagged `open_evidence_synthetic` in scored JSON (analyst/shadow path only — operator UI stays claim-first).

| Source | Closed bundle | Open pipeline bundle |
|--------|---------------|----------------------|
| news / radio / field / whatsapp | `signals-{source}-{date}.json` | `observations-pipeline-{source}-{date}.json` |
| social | `signals-social-{date}.json` | `observations-pipeline-social-{date}.json` |
| PBO municipal | `signals-pbo-{date}.json` | `observations-pipeline-pbo-{date}.json` |
| regional PBO | `signals-pbo_regional-{date}.json` | `observations-pipeline-pbo_regional-{date}.json` |
| Naftali | `signals-naftali-{weekDate}.json` | `observations-pipeline-naftali-{weekDate}.json` |

| Env | Default | Effect |
|-----|---------|--------|
| `RESILIENCE_OPEN_EXTRACT_PARALLEL` | `1` | Pipeline open extract on all wired extractors |
| `RESILIENCE_OPEN_OBS_FOR_AGENT` | `1` | Feed open obs to evidence graph |
| `RESILIENCE_OPEN_OBS_ROUTING` | `llm` | Component routing (`keyword` fallback) |
| `RESILIENCE_OPEN_OBS_GRAPH_CAP` | `20` | Max open obs claims in graph |
| `RESILIENCE_OPEN_EVIDENCE_SCORING` | `1` | Verified → synthetic `/10` inputs |
| `RESILIENCE_OPEN_EVIDENCE_SCORE_WEIGHT` | `0.4` | Discount on synthetic mass |
| `RESILIENCE_CATALOG_AUTO_PROPOSE_VERIFIED` | `0` | Auto draft catalog proposals |
