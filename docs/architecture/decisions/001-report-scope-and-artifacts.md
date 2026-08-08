# ADR 001: Report scope and regional artifacts

## Status

Accepted

## Context

National and regional (e.g. north) resilience reports share one scoring engine but different evidence subsets. Users can be misled if the API serves a national artifact while the UI shows a regional scope.

## Decision

**Option B + regional artifacts:**

1. **Server assessment** (`runResilienceAssessment`) always applies `filterSignalsForScope` via `scopeAndPartitionSignals` in [`assessmentPipeline.js`](../../../business_modules/resilience_scorer/app/assessmentPipeline.js) before scoring, using `reportScopeId` (default `national`).
2. **CLI `assess-signals`** uses the same `scopeAndPartitionSignals` helper but **persists separate JSON/MD files** per scope (e.g. `resilience-report-north-{date}`).
3. **API** `GET /api/report/today?scope=…` loads the matching artifact; when missing for a regional scope, returns `regional_requires_assess_signals` (not a silent national fallback).

## Consequences

- Evidence submission may pass optional `reportScopeId` for district-scoped analysis.
- Documentation and UI hints must reference `assess-signals --scope` for regional daily files.
- Future districts extend `reportScopeId` via `IReportScopePolicy` (see ADR 004 follow-up) without forking scoring code.
- Signal geo and `district_id` persistence at extract time: [ADR 002](./002-signal-scope-attribution.md).
