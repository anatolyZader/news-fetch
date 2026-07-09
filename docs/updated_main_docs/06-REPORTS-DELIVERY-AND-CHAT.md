# 06 - Reports, Delivery, and Chat

## What this answers

- What a **daily report artifact** actually is (files and fields).
- How reports are **served** (HTTP API) and **scoped** (national / north).
- How the operator **reads and interrogates** a report (UI + chat tools).
- The difference between three things that all say "report": **daily assessment artifacts** (`business_modules/resilience_scorer/data/reports/`), **report_build** (field-report drafting), and **report_bot** (manual inbox).

## 1. Context recap

The officer's deliverable is a thoughtful situation report, ideally **twice a day** (a workflow, not a code scheduler - see file 01). The system produces the analytical backbone of that deliverable: per-component claims, synthesis, decision brief, and instruments, persisted as files and served to a UI and a chat assistant.

## 2. The daily report artifact

Built by `writeReport` in `business_modules/resilience_scorer/infrastructure/reportWriter.js`. Each assessment run writes **three files** under `business_modules/resilience_scorer/data/reports/`:

```106:131:business_modules/resilience_scorer/infrastructure/reportWriter.js
export function writeReport(assessment, signals, sourceFiles, outputBase, { scoreBySource } = {}) {
  mkdirSync(dirname(outputBase), { recursive: true });

  const mdPath = `${outputBase}.md`;
  const briefMdPath = `${outputBase}-brief.md`;
  const jsonPath = `${outputBase}.json`;

  const appendix = buildSignalAppendix(signals);
  const md = buildMarkdown(assessment, sourceFiles, { includeScores: true }) + appendix;
  const briefMd = buildMarkdown(assessment, sourceFiles, { includeScores: false }) + appendix;
  writeFileSync(mdPath, md, 'utf-8');
  writeFileSync(briefMdPath, briefMd, 'utf-8');
  ...
```

| File | Audience | Notes |
|------|----------|-------|
| `{base}.md` | Analyst | Full markdown, **with** scores |
| `{base}-brief.md` | Operator | Same narrative + signal appendix, **no scores** (`includeScores: false`) |
| `{base}.json` | Machine / API | `{ assessment, signals, source_files, generated_at, geo versions, score_by_source? }` |

Output base (`business_modules/resilience_scorer/app/assessment/assessSignalsCli.js`): `business_modules/resilience_scorer/data/reports/{prefix}-{date}-{HHMM}`, where prefix is `resilience-report` (national) or `resilience-report-north`. The `HHMM` suffix is what allows multiple runs per day (the twice-daily workflow). Backfill of briefs from existing JSON: `npm run backfill:report-brief` (`business_modules/resilience_scorer/app/assessment/backfillReportBriefMdCli.js`).

The `assessment` object inside the JSON is the `assessmentV2` structure described in file 04 (8 components, synthesis, decision brief, attention items, agent trace), mapped to the legacy API shape with `overall_resilience_score: null`.

## 3. Serving reports: the HTTP API

`business_modules/resilience_scorer/input/reportRoutes.js`:

| Route | Purpose |
|-------|---------|
| `GET /api/report/today` | Cached report for a scope; operator redaction via `display_view` |
| `GET /api/report/dates` | Available report dates per scope (regional scopes require district access) |
| `GET /api/report/divergence` | Analyst divergence JSON (agent vs shadow score) |
| `POST /api/report/claim-feedback` | Analyst accept/reject a claim -> institutional memory |
| `POST /api/report/recommendations/:id/acknowledge` | Operator acknowledge/dismiss a recommendation |
| `GET /api/municipalities`, `GET /api/pbo/*` | PBO municipality / regional dashboards |
| `POST /api/translate` | Report translation |
| `GET /articles` | News articles for a day |

Report resolution (`business_modules/resilience_scorer/app/reportCacheService.js`) prefers the report with the most `total_articles_analyzed`, then the newest - so multiple same-day runs coexist and the "best" is served.

A regional scope with no report yet returns a hint to run `assess-signals --scope {scope}` rather than fabricating a result.

## 4. Reading and interrogating a report

### 4.1 Operator UI

`client/src/components/ReportView.jsx` is rendered for operators with `displayView="operator"` (analyst tooling lives in a separate `analyst-site/` SPA). The operator sees:

- Epistemic status banner, attention queue, evidence overview.
- Instrument badges (sufficiency, contested, significant delta).
- Component narratives and cited evidence.
- **No headline 1-10** and no numeric per-component scores (redacted at the API; see file 05).

### 4.2 Chat assistant

The chat module lets the officer ask questions against the current report. Operator vs analyst is resolved per user, and scores are included only in analyst view. Relevant tools include `get_decision_brief` and `list_attention_items`; the orchestrator is instructed to call tools before answering (`business_modules/chat/app/chatLlmOrchestrator.js`). State-changing actions are **propose-only** and require human confirmation (`propose_*` tools). Operator-facing chat context is built without scores (`business_modules/chat/app/chatService.js`, `reportContext.js`).

## 5. Three different "reports" - do not conflate

| Thing | Module | What it is |
|-------|--------|------------|
| **Daily assessment report** | `business_modules/resilience_scorer/` | The automated 8-component assessment artifacts in `business_modules/resilience_scorer/data/reports/` (this file, sections 2-4) |
| **Field report builder** | `business_modules/report_build/` | An **interactive** officer chat that gap-fills an observation and drafts a Hebrew field report; SQLite drafts (`report_build_drafts`); on confirm, archived as a `field` source for future pipeline runs |
| **Report bot inbox** | `business_modules/report_bot/` | A **read-only dashboard** over a filesystem inbox of manual reports submitted via a WhatsApp bot or srulik.ai; not auto-extracted into the pipeline |

The field report builder is how human field observations *enter* the system as a source; the daily assessment report is what *comes out* of the pipeline; the report bot inbox is a manual-submission viewing surface. Changes to report-bot flows must be checked against `business_modules/report_bot/` integration (project constitution).

## 6. Delivery beyond the app

A separate mailing digest (`business_modules/mailing/`, `npm run mail:digest`) can email **existing** reports on its own once-daily schedule. It distributes reports; it does not generate them.

## 7. Key code locations

| Concern | Path |
|---------|------|
| Report writer (md / brief / json) | `business_modules/resilience_scorer/infrastructure/reportWriter.js` |
| Output base + time suffix | `business_modules/resilience_scorer/app/assessment/assessSignalsCli.js` |
| Brief backfill | `business_modules/resilience_scorer/app/assessment/backfillReportBriefMdCli.js` |
| Report HTTP API | `business_modules/resilience_scorer/input/reportRoutes.js` |
| Report cache / date resolution | `business_modules/resilience_scorer/app/reportCacheService.js` |
| Scope ids / filename prefix | `cross-cut-modules/geo/reportScopeIds.js` |
| Operator UI | `client/src/components/ReportView.jsx` |
| Chat orchestrator | `business_modules/chat/app/chatLlmOrchestrator.js` |
| Operator chat context | `business_modules/chat/app/chatService.js`, `reportContext.js` |
| Field report builder | `business_modules/report_build/app/reportBuildService.js` |
| Report bot inbox | `business_modules/report_bot/` |
| Mailing digest | `business_modules/mailing/input/runDailyDigest.js` |
