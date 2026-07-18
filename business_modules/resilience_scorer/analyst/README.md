# Analyst quarantine

Headline `/10` scoring lives here — **not** operator daily work. Lives at
`business_modules/resilience_scorer/analyst/`, nested inside the resilience module since scoring is
a hard runtime dependency of its assess pipeline. The former validation-review, tuning/calibration,
drift, and shadow-divergence tooling (and the separate `analyst-site/` SPA that was their only UI)
have been retired — only the scoring engine remains here.

## Operator platform (do not move here)

- Ingest, epistemic hygiene, specialists (`business_modules/specialist_agents/`)
- `business_modules/resilience_scorer/domain/epistemic/` — caps, mass contribution, partition
- `componentDiagnostics`, operator UI/API

## Entry points

| Need | Import |
|------|--------|
| Headline scoring from operator pipeline | `business_modules/resilience_scorer/app/scoringFacade.js` only |
| Direct analyst tooling | `business_modules/resilience_scorer/analyst/` |

## Boundaries

- `analyst/` may import `business_modules/resilience_scorer/domain/epistemic/`
- `business_modules/resilience_scorer/**` must not import `business_modules/resilience_scorer/analyst/**` except `scoringFacade.js` (see `.dependency-cruiser.cjs`)
- `client/**` must not import `business_modules/resilience_scorer/analyst/**`

## Open evidence (operator pipeline)

Extract runs closed catalogue + parallel open observations (`RESILIENCE_OPEN_EXTRACT_PARALLEL=1` default). **All extractors** write `observations-pipeline-{sourceType}-{date}.json`: MD sources via `extract-signals` / regional PBO dual-path; social after classify/treat; PBO municipal and Naftali from free-text adapter units. Assess loads pipeline bundles separately from closed signals; agent/RAG receives routed open obs (`RESILIENCE_OPEN_OBS_FOR_AGENT=1`).

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
