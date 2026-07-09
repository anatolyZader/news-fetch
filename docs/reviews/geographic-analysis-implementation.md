## Geographic analysis implementation (long-form review)

This document is a **detailed review** of how geographic analysis is implemented in this app as of the current codebase. It is written to be useful for:

- **Maintainers**: understanding architecture boundaries and where geo is wired.
- **Consumers**: knowing exactly what `geo` means and how to use it safely.
- **Operations**: running geo in production, auditing versions, and handling unknowns.
- **Future evolution**: avoiding semantic drift (locality vs council vs area) and preventing fuzzy matches from leaking into KPIs.

This review complements (and links to) the developer guide: [`docs/main_docu_files/GEOGRAPHIC-ANALYSIS.md`](../main_docu_files/GEOGRAPHIC-ANALYSIS.md).

---

## 1) What “geographic analysis” does in this app

The **`geo`** business module deterministically enriches free-text location inputs into a **versioned `geo` envelope**. That envelope is attached to WhatsApp-derived signals, survey outputs, and report JSON so downstream code can:

- **Scope** signals (especially regional relevance) using explicit `district_id`, structured-source defaults, and deterministic geo district tags — not substring keyword matching.
- **Audit** which reference datasets and border snapshots were used.
- **Control quality** centrally (what is safe to count in metrics vs what needs review).
- **Operate** a feedback loop: unknown/ambiguous localities → review backlog → reference dataset updates.

The key constraint is **non-LLM geography**: the app does not let the model “decide geography”. Instead it uses:

- **Reference tables** (`north-reference.json`) for locality identity + subregion.
- **A simplified border polyline** (`north-border.json`) for distance-to-border.
- Deterministic matching stages and a conservative fuzzy fallback.

---

## 2) Architecture: boundaries, ports, and wiring

### 2.1 The core boundary rule

Code outside the `geo` module should **not import** `business_modules/geo` to enrich location strings. Instead it depends on a **port**:

- `business_modules/resilience_scorer/domain/ports/IGeoEnrichmentPort.js`

The port is implemented by an adapter:

- `business_modules/resilience_scorer/infrastructure/adapters/geoEnrichmentAdapter.js`

That adapter delegates to `geoService` (from `business_modules/geo`) and is **wired only in composition**.

This keeps the dependency direction clean:

- Resilience/WhatsApp/Survey are consumers of the **port**
- Only composition knows about the `geo` implementation

### 2.2 Where geo is enabled (composition points)

Geo is enabled when composition injects a real `geoEnrichmentPort`.

- **Server**: `composition/createApp.js` / `composition/wireApplication.js`
  - Builds `geoService` via `createGeoService(...)`
  - Wires `geoEnrichmentPort = createGeoEnrichmentAdapter({ geoService, unknownSink? })`
  - Passes the port into WhatsApp analyzer/ingest paths
  - Registers geo HTTP routes and decorates Fastify with `geoService`

- **Survey CLI (archived):** former entry was `cross-cut-modules/geo/input/runAnalyzeSurvey.js` — see [`archive/survey-excel-cli/`](../../archive/survey-excel-cli/)

When geo is not wired, WhatsApp analysis defaults to a no-op port returning `kind: 'unknown', reason: 'GEO_DISABLED'`.

### 2.3 Cross-cut helpers

Some geo-related helpers are used by non-geo code (CLI/report) without deep-importing geo internals. These are re-exported via:

- `cross-cut-modules/geo/signalGeoSummary.js`

This also re-exports schema validation (`validateGeoEnvelope`) for attach-time assertions.

---

## 3) Reference data: what is “north-reference” and why it is versioned

All geo reference assets live under:

- `business_modules/geo/data/`

### 3.1 `north-reference.json`

This is the primary locality reference table. Each row includes:

- `canonicalKey` (stable identity)
- `names[]` (lookup variants; Hebrew and English allowed)
- `lat/lon` (point representative)
- `subregionId` (the app’s PBO-aligned north subregion id)
- optional metadata for future UX

The file has a top-level `version` and `source`. Those are copied into every resolved envelope as:

- `geoReferenceVersion`
- `source`

### 3.2 `north-border.json`

A simplified polyline used for distance-to-border calculations. The file includes:

- `version` → emitted as `borderReferenceVersion`
- `coordinates[]` (lat/lon points)

### 3.3 Why versioning matters

Any change to:

- a locality row’s names/subregion assignment, or
- the border geometry

can change downstream analytics. Emitting versions on each envelope makes reports **reproducible** and makes “semantic changes” explicit.

---

## 4) The `geo` envelope contract (what consumers see)

The `geo` field is attached to signals and outputs. Consumers must treat it as **optional**.

The shape is a discriminated union:

- `kind: 'resolved'`
- `kind: 'unknown'`

The canonical description lives in:

- `docs/main_docu_files/GEOGRAPHIC-ANALYSIS.md`
- typedefs: `business_modules/geo/domain/value_objects/geoEnrichment.js`
- schema: `business_modules/geo/domain/value_objects/geoEnrichmentSchema.js`

### 4.1 Resolved envelopes

Resolved means the input was matched to a reference row and geo classification fields were computed.

Key fields:

- **Nested contract (v3 nested-only writes)** — the service emits grouped objects; flat duplicate keys are omitted on new resolves unless `GEO_LEGACY_SUBREGION_ID=1`. Legacy stored envelopes may still carry flat keys — read via `geoEnvelopeAccess.js`.
  - `resolution` (raw input → identity, including `geoEntityType`)
  - `classification` (subregion, tags, distance, optional `distanceSemantics`)
  - `policy` (quality, metrics safety, `geoPolicyVersion`, `decisionReasons`, `scopeConfidence`)
  - `audit` (reference/border versions + `resolvedAt`)
  - **`scopeDecision`** — district relevance **implied by this geo envelope only** (tags + PBO id + district mapping). For full-signal scoping (explicit `district_id`, `legacy_north_fallback` for structured sources, or geo), see **`signal.scopeDecision`** from `filterSignalsForScope` in §8.
  - **Nested fields are canonical.** Flat duplicates exist only for backward compatibility — **new code must read nested objects first**; do not add new readers of flat fields.
- **Resolution identity**
  - `canonicalKey`
  - `matchedName`
  - `matchMethod`: `exact | punctuation | hebrew_final | alias | manual_override | fuzzy`
  - `matchConfidence`: numeric; deterministic stages use ~1; fuzzy uses similarity score

- **Classification**
  - `pboSubregionId`: the canonical, non-legacy field used by new consumers
  - `geoAreaTags`: derived tags (includes `north` for north rows)
  - `distanceKmToNorthBorder`
  - `distanceBand`: `0-10 | 10-25 | 25+ | unknown`
  - `distanceSemantics`: `point_to_polyline | representative_centroid_to_polyline` when present on resolved payloads
  - `isGolan`: convenience boolean derived from PBO subregion ID

- **Audit and quality policy**
  - `geoReferenceVersion`, `borderReferenceVersion`, `source`
  - `quality`: `high | medium | low`
  - `usableForMetrics`: safe for KPIs and aggregates?
  - `requiresReview`: should this be reviewed by an operator?
  - `scopeConfidence`: `high | medium | low` for *north-scoped analytics* (separate from string match confidence)
  - `geoPolicyVersion`: policy version string for thresholds/safety rules (distinct from reference/border versions)

- **Entity typing (`geoEntityType`)** — full enum is validated in `geoEnrichmentSchema.js`: `locality`, `municipality`, `regional_council`, `pbo_subregion`, `district`, `area`, `subregion`, `border_zone`, `facility`, `unknown`. Resolved envelopes usually emit **`locality`**; reference rows may set **`regional_council`** / **`municipality`**; macro / unknown paths use **`area`** or **`unknown`** as appropriate.

- **Match evidence (debugging and admin review)**
  - `matchEvidence.rawInput`
  - `matchEvidence.normalizedInput`
  - `matchEvidence.matchedVariant`
  - `matchEvidence.candidateCount`

#### Legacy: `subregionId`

`subregionId` is a deprecated duplicate of `pboSubregionId`. It is controlled by:

- `GEO_LEGACY_SUBREGION_ID` (default **off**; set `1` to emit deprecated duplicate; `0`/`false` omits)

New consumers must use **`pboSubregionId`** and tags only.

### 4.2 Unknown envelopes

Unknown means the app could not confidently resolve the input.

Important fields:

- `reason`: one of:
  - `NO_LOCALITY` (empty input)
  - `NO_MATCH` (no match even by fuzzy floor)
  - `NO_CONFIDENT_MATCH` (fuzzy found candidates but too ambiguous)
  - `GEO_DISABLED` (no-op port; geo not wired)
- `rawName`: the raw input string (or null)
- `geoReferenceVersion`: version if available (null when disabled)
- `source`: reference source if known
- `candidates`: present for `NO_CONFIDENT_MATCH` (top canonical keys with scores)

---

## 5) Resolution pipeline (how `resolveLocalityName` works)

The main entrypoint is:

- `business_modules/geo/app/geoService.js` → `resolveLocalityName(rawName)`

The algorithm proceeds as follows.

### Step 0: Load and index reference data

On service creation:

- Load the bundle from `IGeoNorthReferencePort`
- Build a lookup index mapping normalized name → reference row

### Step 1: Normalize input / early exit

- `trim()` the raw input
- If empty → return unknown `NO_LOCALITY`

### Step 2: Exact stage matching (deterministic)

In `domain/services/resolveLocalityMatch.js`:

1. **Exact**: normalize key (NFKC, lowercase, whitespace collapse), lookup
2. **Punctuation-stripped**: remove quotes/punctuation then normalize and lookup
3. **Hebrew final-letter normalization**: map final forms to standard forms and lookup

If any stage hits, it returns the reference row, `matchMethod`, and `matchConfidence` (≈1 for deterministic stages).

### Step 3: Manual SQLite overrides (optional)

When composition wires `GEO_OVERRIDES_SQLITE=1`, `lookupOverride(raw, normalized)` runs **before fuzzy**. A hit forces `matchMethod: 'manual_override'` and can optionally set `geoEntityType`.

### Step 4: Fuzzy fallback (conservative)

If exact stages and overrides fail:

- Compute Dice bigram similarity between the query and each reference name
- Keep candidates above `FUZZY_MIN_SCORE` (0.88)
- If the top candidate is too close to runner-up (`FUZZY_AMBIGUITY_GAP` 0.02) → ambiguous
- Otherwise return a fuzzy win with `matchConfidence` = similarity score and `candidateCount` = number of above-floor candidates

Ambiguous → unknown `NO_CONFIDENT_MATCH` with `candidates`.  
No candidates → proceed to Step 5 (not immediately `NO_MATCH`).

### Step 5: Macro area terms (only after no table match)

Conservative `NON_LOCALITY_AREA_TERM` for strings like **צפון** / **הגליל** / English **golan** when they did **not** match any reference row (so a named locality/council in `north-reference.json` still wins).

### Step 6: Compute classification fields

Given a chosen reference row:

- `pboSubregionId` = `row.subregionId`
- `distanceKmToNorthBorder` computed to polyline (`distanceKmToPolyline`)
- `distanceBand` from km (`distanceBandForKm`)
- `geoAreaTags` derived from PBO subregion
- `distanceSemantics` from entity type (`referenceGeoEntityType.js`)
- `isGolan` derived from PBO subregion

### Step 7: Derive quality and analytics policy fields centrally

Quality policy lives in `business_modules/geo/domain/services/geoQualityPolicy.js` and produces `quality`, `usableForMetrics`, `requiresReview`. **`geoEntityType`** can downgrade metrics safety (e.g. `regional_council`). `scopeConfidence` is derived from `usableForMetrics` + `requiresReview` via `deriveScopeConfidence`.

### Step 8: `geoEntityType`, `matchEvidence`, and `scopeDecision`

- `resolution.geoEntityType` / top-level duplicate: from reference row + optional override coalescing.
- `matchEvidence`: deterministic audit (`rawInput`, `normalizedInput`, `matchedVariant`, `candidateCount`).
- **`scopeDecision`**: `buildGeoScopeDecision` in `geoScopeDecisionFromResolved.js` — auditable north hint **from geo fields only** (stored on the envelope).

### Step 9: Handle legacy `subregionId`

If `GEO_LEGACY_SUBREGION_ID` is enabled, the service emits `subregionId` (deprecated duplicate); otherwise it is omitted.

### Step 10: Schema assert before returning

`geoService` validates output via `validateGeoEnvelope` (internal invariant guard).

---

## 6) Schema validation and drift detection

Schema validation is implemented as a dependency-free structural validator:

- `business_modules/geo/domain/value_objects/geoEnrichmentSchema.js`

It checks:

- required keys
- discriminated union correctness (`kind`)
- enums (`matchMethod`, `quality`, `geoEntityType`, `scopeConfidence`, `scopeDecision.*`)
- `matchEvidence` presence and its required keys
- required **`scopeDecision`** on resolved envelopes (`isNorthRelevant`, `source`, `confidence`, `usableForMetrics`, `reasons`)
- optionality of `subregionId`

### Optional attach-time assertion in WhatsApp path

In WhatsApp analyzer attachment:

- If `GEO_ASSERT_ENVELOPE=1`, the app validates `geo` immediately after `resolveLocalityName` and throws if invalid.

This prevents invalid shapes from being written into persisted WhatsApp JSON.

---

## 7) Where geo is attached (propagation paths)

### 7.1 WhatsApp signals

In:

- `business_modules/whatsapp/app/whatsappResilienceAnalyzer.js`

Flow:

- Extract locality into `structured.observation.locality`
- Call `geoEnrichmentPort.resolveLocalityName(locality)`
- Attach the same envelope to:
  - each signal object: `signal.geo`
  - `structured.observation.geo`

This makes geo a message-level assumption that downstream consumers can inspect explicitly.

### 7.2 Survey pipeline *(archived 2026-07-09)*

Former offline Excel CLI — not in active codebase. See [`archive/survey-excel-cli/README.md`](../../archive/survey-excel-cli/README.md).

Previously:

- Entry: `business_modules/resilience_scorer/input/analyzeSurveyInput.js`
- Flow: `m.geo = geoEnrichmentPort.resolveLocalityName(m.name)` per municipality
- Reports: `archive/survey-excel-cli/.../surveyReportWriter.js` (included geo audit lines in MD output)

### 7.3 Resilience report JSON audit fields

In:

- `business_modules/resilience_scorer/infrastructure/reportWriter.js`

The written report JSON includes:

- `geo_reference_versions_used` (sorted unique)
- `border_reference_versions_used` (sorted unique)

Derived by scanning `signals[].geo` where `geo.kind === 'resolved'`.

---

## 8) North scoping logic (district assignment and geo)

Regional scoping is implemented in:

- `business_modules/resilience_scorer/domain/services/regionSignalFilter.js` — `scopeDecisionForSignal`, `filterSignalsForScope`
- `business_modules/resilience_scorer/domain/services/signalDistrictId.js` — `signalDistrictId`, `assignedDistrictScopeMatch`, `LEGACY_NORTH_STRUCTURED_SOURCE_TYPES`

Decision outline (for a target scope such as `north`):

1. **`assignedDistrictScopeMatch`** — if `signal.district_id` matches the target scope, or the signal’s `source_type` is in `LEGACY_NORTH_STRUCTURED_SOURCE_TYPES` (`field`, `field_whatsapp`, `pbo`, `pbo_regional`, `naftali`, `whatsapp`) and no explicit district is set, assign **`legacy_north_fallback`** (defaults to `north`).
2. **`districtRelevanceFromResolvedGeo`** — if `signal.geo.kind === 'resolved'`, district relevance comes from geo tags / home-front district mapping via `districtRelevanceFromResolvedGeo(scopeId, geo)`.
3. Otherwise the signal is **not scope-relevant** for regional runs. There is **no** substring / `NORTH_TERMS` keyword fallback.

**Two `scopeDecision` shapes:**

- **`geo.scopeDecision`** (on resolved `signal.geo`) — emitted by `geoService` / `buildGeoScopeDecision`: answers “from this geo object alone, what district relevance is implied?”
- **`signal.scopeDecision`** (attached by `filterSignalsForScope`) — full filter trace including `signal_district`, `legacy_north_fallback`, or geo-derived sources. Use this when explaining why a signal entered a **regional report**.

**Epistemic note:** `usableForMetrics === false` or text-inferred geo may still affect **scope** for narrative context while being excluded from component metrics under `RESILIENCE_EPISTEMIC_GEO_V2` (see [RESILIENCE-ENGINE-REFERENCE.md](../main_docu_files/RESILIENCE-ENGINE-REFERENCE.md) §3).

The design intent:

- Prefer **explicit district assignment** and **deterministic geo** when available
- Default structured field/PBO/WhatsApp bundles to north only when `district_id` is absent (legacy bundles)

---

## 9) Unknown locality review backlog (operations)

Unknown and ambiguous inputs are operationally valuable: they represent what field officers actually write and what the reference data is missing.

### 9.1 Sink port

- `business_modules/geo/domain/ports/IGeoUnknownSinkPort.js`

### 9.2 JSONL adapter

- `business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.js`

Behavior:

- Append-only JSONL rows with timestamp, reason, raw_name, versions, and candidates
- Creates the directory on first write

### 9.3 Wiring and trigger

In composition (`composition/createApp.js`):

- If `GEO_UNKNOWN_REVIEW_JSONL=1`, create the sink and inject it into `GeoEnrichmentAdapter`
- If `GEO_UNKNOWN_REVIEW_SQLITE=1`, also wire the SQLite-backed queue adapter (durable review backlog)

In `GeoEnrichmentAdapter`:

- If result is `kind: 'unknown'` and reason is `NO_MATCH` or `NO_CONFIDENT_MATCH`, record it

This is intentionally “side-channel” and optional: geo remains deterministic and pure, while operations can opt-in to persistence.

### 9.4 SQLite queue (durable review backlog)

When enabled, the SQLite queue upserts unknowns by normalized raw name + reason + source type, increments an `occurrence_count`, and tracks `first_seen_at` / `last_seen_at` plus last candidates JSON. This supports an operational review workflow without changing resolver determinism.

---

## 10) Internal resolve API (debugging / admin)

Geo is also exposed via HTTP for debugging:

- `GET /api/geo/resolve?name=...` (or `q=...`)

It uses `request.server.geoService` (Fastify decoration wired from `composition/createApp.js`) rather than importing geo inside routes.

---

## 11) Tests and correctness envelope

The geo system is backed by tests across:

- matching stages and fuzzy behavior (`resolveLocalityMatch` tests)
- distance-to-polyline computations and banding
- quality policy and `scopeConfidence`
- schema validation (`validateGeoEnvelope`)
- adapters (reference JSON, unknown JSONL sink)
- adapter wiring behavior (`GeoEnrichmentAdapter`)
- `regionSignalFilter` semantics around `usableForMetrics`

The intent is to keep geo deterministic and contract-stable as it propagates through WhatsApp JSON, survey markdown, and report JSON.

---

## 12) Known limitations and next evolution direction

The codebase originally shipped a “flat envelope” contract for speed; v3 resolves are **nested-only** with **`resolution.provenance`** for epistemic policy. Legacy flat keys on stored blobs are read-tolerated via **`geoEnvelopeAccess.js`**. The main long-term risk remains **semantic drift**: locality vs municipality vs regional council vs vague area strings.

The direction that keeps auditability high is:

- Evolve contract toward **resolution / classification / audit** subobjects
- Add explicit `geoEntityType` variants beyond `locality`
- Preserve deterministic matching; do not “LLM geocode”

Operationally, the next steps that improve scalability and dashboards are:

- Add denormalized SQLite columns for geo attributes (while keeping full JSON)
- ~~Add a manual override table for recurring officer spelling variants~~ **Shipped:** SQLite overrides when `GEO_OVERRIDES_SQLITE=1` ([`geoLocalityOverridesSqliteAdapter.js`](../../business_modules/geo/infrastructure/adapters/geoLocalityOverridesSqliteAdapter.js)); see developer guide § Manual overrides.
- Version analytic policy decisions (distance bands, scope confidence rules) explicitly

See the roadmap table in the developer guide for current tracking:

- [`docs/main_docu_files/GEOGRAPHIC-ANALYSIS.md`](../main_docu_files/GEOGRAPHIC-ANALYSIS.md)

