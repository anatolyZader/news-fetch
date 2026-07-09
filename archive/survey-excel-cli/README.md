# Survey Excel CLI (archived)

Offline tooling for Google Forms Excel exports → per-municipality qualitative resilience reports (Haiku LLM). **Removed from active codebase** (2026-07-09): not displayed in srulik.ai, no API routes, no pipeline integration.

## Former entry point

```bash
npm run analyze-survey -- --responses <path.xlsx> [--municipality <name>] [--date YYYY-MM-DD]
```

Wired via `cross-cut-modules/geo/input/runAnalyzeSurvey.js` (geo enrichment port).

## Archived files (original paths)

| File | Role |
|------|------|
| `business_modules/resilience_scorer/app/analyzeSurveyCli.js` | CLI orchestrator |
| `business_modules/resilience_scorer/app/surveyEvaluator.js` | LLM assessment + checkpoints |
| `business_modules/resilience_scorer/app/surveyReportWriter.js` | MD/JSON report writer |
| `business_modules/resilience_scorer/infrastructure/adapters/surveyExcelLoader.js` | Excel + mapping parser |
| `business_modules/resilience_scorer/input/analyzeSurveyInput.js` | Thin re-export (unused by npm) |
| `cross-cut-modules/geo/input/runAnalyzeSurvey.js` | Composition entry (geo wiring) |

## Outputs (if re-run manually)

- Reports: `business_modules/resilience_scorer/data/survey/survey-report-{date}-{slug}.md`
- Checkpoints: `survey-checkpoint-{date}-{slug}.json`
- Input mapping default: `business_modules/visits/data/survey/survey-question-mapping.json`

## Not the same as

- **`population_survey_finding` / `named_survey_statistic`** — signal types in the main extract/assess pipeline (still active).
- **PBO Municipalities tab** — `/api/municipalities` from `pbo_report_muni`, not this CLI.

## Restore (manual)

Copy files back to original paths, re-add `analyze-survey` script in `package.json`, export `runAnalyzeSurveyCli` from `resilience_scorer/index.js`, and restore path helpers in `outputDirs.js` if needed.
