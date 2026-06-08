# Geographic analysis

**Purpose:** Deterministic **locality resolution** and **district scoping** for signals and reports. Geo is not LLM-inferred at assess time for metrics eligibility — envelopes are structured and versioned. The **assessment agent** path uses the same scoped/partitioned signals as shadow scoring (`regionSignalFilter.js`); geo does not change at the agent layer.

**Sources:** `business_modules/geo/`, `cross-cut-modules/geo/enrichSignalsWithGeo.js`, `business_modules/resilience/domain/services/regionSignalFilter.js`.

---

## Geo module layout

| Layer | Path |
|-------|------|
| App | `business_modules/geo/app/geoService.js` — search, resolve, build envelope |
| Domain | `domain/services/` — match, quality, scope, distance bands |
| Ports | `domain/ports/IGeoNorthReferencePort.js`, `IGeoLocalityOverridesPort.js`, `IGeoUnknownSinkPort.js`, `IGeoUnknownReviewPort.js` |
| Adapters | `infrastructure/adapters/` — JSON reference, SQLite overrides/queue |
| Data | `data/north-reference.json`, `north-border.json`, `regions.json`, `homefront-district-stubs.json`, `distance-band-policy.json` |
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

## Signal-level scoping (resilience)

**File:** `regionSignalFilter.js`

- **`deriveHomeFrontDistricts(signal)`** — union of `signal_district` + districts from resolved `signal.geo`
- **`scopeDecisionForSignal(signal, targetScopeId)`** — explainable trace; national always in-scope
- **`filterSignalsForScope(signals, scope)`** — drops non-relevant signals for regional scopes

Regional reports require resolved geo (or always-in-scope source types) matching target district. Non-north localities may match via `homefront-district-stubs.json` when absent from `north-reference.json`.

**Port:** `IReportScopePolicy` → `defaultReportScopePolicyAdapter.js` → `assessmentPipeline.js` (`scopeAndPartitionSignals`).

Report scope ids: `cross-cut-modules/geo/reportScopeIds.js` (national + five regional districts).

---

## Enrichment at extract/assess

**`enrichSignalsWithGeo.js`** (cross-cut-modules) attaches `geo` envelopes during extract and assess when locality strings present.

WhatsApp, survey, news paths use geo service through enrichment port — no duplicate resolver logic in resilience.

---

## Analyst unknown queue

Unknown resolutions sink to SQLite/JSONL adapters (`geoUnknownSqliteQueueAdapter.js`, `geoUnknownJsonlSinkAdapter.js`).

Analysts triage via `/api/geo/unknown-queue` and chat tool `list_geo_unknown` (see [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md)).

---

## Related docs

- Scoped assess: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
- Epistemic geo gating: [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md) §4
