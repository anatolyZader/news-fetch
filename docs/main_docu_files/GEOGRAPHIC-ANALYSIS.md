# Geographic analysis

**Purpose:** Deterministic **locality resolution** and **district scoping** for signals and reports. Geo is not LLM-inferred at assess time for metrics eligibility — envelopes are structured and versioned. The **assessment agent** path uses the same scoped/partitioned signals as shadow scoring (`regionSignalFilter.js`); geo does not change at the agent layer.

**Sources:** `business_modules/geo/`, `cross-cut-modules/geo/enrichSignalsWithGeo.js`, `cross-cut-modules/geo/localityCandidate.js`, `cross-cut-modules/geo/geoAttachPolicy.js`, `business_modules/resilience/domain/services/regionSignalFilter.js`.

---

## Geo module layout

| Layer | Path |
|-------|------|
| App | `business_modules/geo/app/geoService.js` — search, resolve, build envelope |
| Domain | `domain/services/` — match, quality, scope, distance bands |
| Ports | `domain/ports/IGeoNorthReferencePort.js`, `IGeoLocalityOverridesPort.js`, `IGeoUnknownSinkPort.js`, `IGeoUnknownReviewPort.js` |
| Adapters | `infrastructure/adapters/` — JSON reference, SQLite overrides/queue |
| Data | `data/north-reference.json`, `north-border.json`, `regions.json`, `homefront-district-stubs.json`, `landmark-gazetteer.json`, `distance-band-policy.json` |
| HTTP | `input/geoRoutes.js` |

Wiring: composition root registers `geoService` and `IGeoEnrichmentPort` for resilience ingest.

---

## Envelope contract (v3)

**Version id:** `geo-envelope-2026-05-v3` (`domain/value_objects/geoEnvelopeVersion.js`).

**Resolved** (`kind: 'resolved'`):

- Nested groups: `resolution`, `classification`, `policy`, `audit`
- `matchEvidence`, `scopeDecision` (geo-level north/district relevance)
- Validated by `validateGeoEnvelope()` in `geoEnrichmentSchema.js`

**Unknown** (`kind: 'unknown'`):

- `reason`, optional `candidates`, audit fields
- Recorded to unknown queue for analyst review

**Provisional** (`kind: 'provisional'`) — landmark gazetteer fallback:

- Matched via `landmarkGazetteer.js` + `data/landmark-gazetteer.json` when fuzzy resolution fails (flag `GEO_LANDMARK_GAZETTEER`, default on)
- Required: `probableDistrict`, `probableSubregionId`, `resolutionMethod: 'landmark_gazetteer'`, low `matchConfidence` (~0.6)
- **Policy:** `usableForMetrics: false`, `requiresReview: true`, `quality: 'low'` — context-only; does **not** enable component scoring
- Still recorded to unknown queue with `reason: 'PROVISIONAL_LANDMARK'` for analyst review

**Provenance** (`geoProvenance.js`): `structured`, `text_inferred`, `message_level`, `direct` — affects epistemic metrics eligibility when geo v2 enabled.

---

## HTTP routes

Registered via `registerGeoRoutes(app, opts)`:

| Route | Role |
|-------|------|
| `GET /api/geo/localities?q=` | Search localities (limit 20) |
| `GET /api/geo/resolve?name=` | Resolve single name to envelope |
| `GET /api/geo/unknown-queue` | Analyst-only — review backlog |
| `POST /api/geo/unknown-queue/:id/status` | Analyst-only — update queue item |

---

---

## Locality candidate guards

Before `geoService` resolves an envelope, **`localityCandidate.js`** (`cross-cut-modules/geo/`) infers a candidate place name from signal metadata. Guards added Jun 2026 prevent news headlines and analyst discourse from being treated as geographic localities.

| Guard | Rule | Why |
|-------|------|-----|
| **Em-dash field titles** | `parseFieldReportTitleLocality(title)` returns a municipality only when the title contains an em dash (`—`); plain headlines without a dash return `null` | Stops news obituary/headline text from parsing as a place |
| **Field-only title parsing** | `inferLocalityCandidateForSignal` uses title parsing **only** when `source_type === 'field'` | News/radio/whatsapp titles are not locality sources |
| **Discourse filter** | `isDiscourseOnlyMention` + `hasLocativeContext` skip analyst-studio framing ("analysts discussed X") unless locative Hebrew/English patterns are present | Reduces false positives from broadcast commentary |

**Assess-time re-resolve:** `attachGeoToSignals` uses `shouldAttachGeoToSignal` (see [§ geoAttachPolicy](#geoattachpolicy)) — only signals without `geo` are enriched; locality guards above apply to candidate inference.

Tests: `tests/cross-cut-modules/geo/localityCandidate.test.js`.

## geoAttachPolicy

**File:** `cross-cut-modules/geo/geoAttachPolicy.js` — gate before `geoService` runs on a signal.

**Source allowlist** (`RESILIENCE_GEO_SOURCE_TYPES`): `news`, `radio`, `social`, `whatsapp`, `field`, `pbo`, `pbo_regional`, `naftali`. Signals with other `source_type` values are skipped unless `source_type` is null (legacy bundles).

**`shouldAttachGeoToSignal(signal)`:**

- Returns `false` when the signal already has a non-null `geo` property (no re-attach on existing envelopes — Jun 2026 fix removed erroneous re-resolution when `geo` was already set).
- Returns `true` when `source_type` is in the allowlist (or null) and `geo` is absent.

Called from `attachGeoToSignals` / `enrichSignalsWithGeo.js` at both extract and assess. Assess-time re-resolve only applies to signals that still lack `geo` after extract.


## Signal-level scoping (resilience)

**Files:** `domain/services/regionSignalFilter.js` (canonical logic); `app/regionSignalFilter.js` re-exports `normalizeReportScope` for Option B `input/` routes (e.g. `driftRoutes.js`).

- **`deriveHomeFrontDistricts(signal)`** — union of `signal_district` + districts from resolved `signal.geo`
- **`scopeDecisionForSignal(signal, targetScopeId)`** — explainable trace; national always in-scope
- **`filterSignalsForScope(signals, scope)`** — drops non-relevant signals for regional scopes

Regional reports require resolved geo (or always-in-scope source types) matching target district. Non-north localities may match via `homefront-district-stubs.json` when absent from `north-reference.json`.

**Port:** `IReportScopePolicy` → `defaultReportScopePolicyAdapter.js` → `business_modules/resilience/app/assessmentPipeline.js` (`scopeAndPartitionSignals`).

Report scope ids: `cross-cut-modules/geo/reportScopeIds.js` (national + five regional districts).

---

## Enrichment at extract/assess

**`enrichSignalsWithGeo.js`** (cross-cut-modules) attaches `geo` envelopes during extract and assess when locality strings present.

WhatsApp, survey, news paths use geo service through enrichment port — no duplicate resolver logic in resilience.

---

## Analyst unknown queue

Unknown resolutions sink to SQLite/JSONL adapters (`geoUnknownSqliteQueueAdapter.js`, `geoUnknownJsonlSinkAdapter.js`).

**Canonical resolution path (analyst HITL):** `/api/geo/unknown-queue` (analyst-only) and chat tools `list_geo_unknown` / `propose_geo_unknown_update` (confirm-gated). Operators do **not** resolve unknown localities directly in the geo API.

**Operator surfacing:** `GET /api/report/today` passes pending `new` queue count into `buildActionCompass` as `geoUnknownCount` — operators see a **warning** in the action compass when unresolved localities exist; i18n directs them to analyst triage before dispatch.

See [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md) and [SYSTEM-AND-OPERATOR-MODEL.md § UI surfaces](./SYSTEM-AND-OPERATOR-MODEL.md#ui-surfaces-operator-app).

---

## Related docs

- Scoped assess: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
- Epistemic geo gating: [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md) §4
