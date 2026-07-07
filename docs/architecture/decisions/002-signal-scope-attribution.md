# ADR 002: Signal scope attribution and unified assessment core

## Status

Accepted

## Context

Regional resilience reports (e.g. north) filter evidence via `filterSignalsForScope` in [`regionSignalFilter.js`](../../../business_modules/resilience_scorer/domain/services/regionSignalFilter.js). News and social signals only survive regional scope when they carry explicit `district_id`, resolved north `geo`, or (legacy) default-north source types (`field`, `pbo`, `whatsapp`, etc.).

Prior to this change:

- **Geo attribution** was scattered across extract writers (`enrichSignalsWithGeo` in article dual-path, PBO, Naftali, social treat) with inconsistent `district_id` stamping.
- **Assess-time geo** duplicated between CLI (`assessSignalsCli.js`) and server (`resilienceAnalysisService.js`).
- **CLI and server** shared scoring helpers but diverged on orchestration order (CLI scored before narrate; server narrated first) and I/O boundaries.
- **`scopeDecision`** was computed only at assess time and never persisted on bundles.
- **Default-north fallback** for north-only structured sources without `district_id` had no env gate or metrics.

See also [ADR 001: Report scope and regional artifacts](./001-report-scope-and-artifacts.md).

## Decision

### 1. Upstream persisted attribution

Add [`attributeSignalScope`](../../../cross-cut-modules/geo/attributeSignalScope.js) as the single extract-time stage before bundle write:

- Resolve `geo` via existing `enrichSignalsWithGeo` / `attachGeoToSignals`.
- Derive `district_id` in priority order: explicit signal → resolved geo → bundle-level `district_id`.
- **Do not** apply default-north at extract time (that remains in assess-time scope filtering).

All closed-source extract writers call `attributeSignalScope` instead of inline geo enrichment.

### 2. Assess-time geo fallback (legacy bundles)

Extract shared [`enrichSignalsGeoIfNeeded`](../../../cross-cut-modules/geo/enrichSignalsGeoIfNeeded.js) for CLI and server. Behavior unchanged: attach geo only when missing (`shouldAttachGeoToSignal`).

### 3. Unified post-extraction assessment core

Add [`runPostExtractionAssessmentCore`](../../../business_modules/resilience_scorer/app/postExtractionAssessmentCore.js) starting at `scopeAndPartitionSignals`:

`scope → prepareInvestigation → prepareScoring → runScoringPipeline → produceAssessmentWithShadow → post-metadata → attachDecisionBrief`

**Canonical order: score before narrate** (CLI order). Server path adopts this.

CLI keeps CLI-only I/O in `finalizeAndWriteReport`; server keeps persist + pipeline run tracker outside the core.

### 4. Default-north gate-and-log (no removal)

Keep `DEFAULT_NORTH_SOURCE_TYPES` as assess-time safety net. Add `RESILIENCE_DEFAULT_NORTH_FALLBACK` (default `true`). When `false`, `signalDistrictId` returns `null` instead of `'north'` for default-north source types without explicit `district_id`.

Emit metric `resilience.scope.default_north_fallback` and log when signals match via `default_north_district`.

### 5. News locality

Keep `locality` on extract-v3 output ([`extractionPrompt.js`](../../../cross-cut-modules/resilience-contracts/extractionPrompt.js)) to feed geo candidate inference.

## Consequences

- **Forward-only migration:** old bundles without `locality`/`geo` rely on assess-time `enrichSignalsGeoIfNeeded`; no backfill script.
- **Re-extract required** for full news/social north benefit on regional reports; then run `assess-signals --scope north`.
- **Default-north removal criteria:** `default_district_signal_count === 0` on fresh extractor runs with `RESILIENCE_DEFAULT_NORTH_FALLBACK=false` before hard-removing the constant.
- **Open observation bundles** remain out of scope for persisted `district_id`/`geo` (schema strips unknown keys); assess fallback + `MappedObservationBundleAdapter` suffice for now.
- **Pipeline stage labels** on server reflect SCORE before NARRATE.

## Out of scope (this ADR)

- Backfill script for old bundles
- Hard removal of `DEFAULT_NORTH_SOURCE_TYPES`
- Open observation bundle schema extension
- Merging `prepareInvestigationSignals` / `prepareScoringSignals` internals
- Single national artifact filtered at read-time
