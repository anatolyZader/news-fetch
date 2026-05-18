# Geographic enrichment — developer guide

**Location:** `docs/main_docu_files/` (canonical main documentation — see [README](./README.md))

This document describes **deterministic geographic enrichment** in the app: how localities are resolved to a canonical **`geo` envelope**, where that envelope is **attached** (WhatsApp signals, survey reports, APIs), how **versions** keep results auditable, and how this interacts with **north scoping** and evidence storage.

---

## What this system does (in one paragraph)

The **`geo`** business module turns a **free-text locality name** (Hebrew or English, survey Excel cell, WhatsApp extraction, etc.) into a **structured, versioned object**: PBO subregion, optional geographic tags, approximate **distance to a simplified north border polyline**, distance **band**, and metadata about **how** the string was matched (exact, punctuation-normalized, Hebrew finals, or fuzzy). Other application code does **not** import `geo` directly; it uses the **`IGeoEnrichmentPort`** from resilience, implemented by **`GeoEnrichmentAdapter`** and **wired only from composition** ([`app.js`](../app.js), [`scripts/analyze-survey.mjs`](../scripts/analyze-survey.mjs)).

---

## Architecture at a glance

| Layer | Responsibility |
|-------|------------------|
| **`business_modules/geo`** | Reference JSON + border polyline, pure math (Haversine, polyline distance, Dice similarity), `createGeoService`, optional **HTTP** routes under `geo/input/` |
| **`IGeoEnrichmentPort`** ([`resilience/domain/ports/IGeoEnrichmentPort.js`](../business_modules/resilience/domain/ports/IGeoEnrichmentPort.js)) | Single method: `resolveLocalityName(rawName)` → envelope |
| **`GeoEnrichmentAdapter`** ([`resilience/infrastructure/adapters/geoEnrichmentAdapter.js`](../business_modules/resilience/infrastructure/adapters/geoEnrichmentAdapter.js)) | Delegates to injected `geoService` |
| **`NoOpGeoEnrichmentPort`** | Same port shape; always returns `kind: 'unknown', reason: 'GEO_DISABLED'` (e.g. tests or missing wiring) |
| **Composition** | [`app.js`](../app.js): `geoService` + `geoEnrichmentPort` + `app.decorate('geoService', geoService)` + `registerGeoRoutes`; WhatsApp analyzer receives `geoEnrichmentPort` |

**Boundary rule:** resilience/whatsapp **must not** import `business_modules/geo` for enrichment. Use the port; build the adapter at the app or script entrypoint.

---

## The `geo` envelope (contract)

Every consumer should treat **`geo`** as an optional field. Shape is always either **resolved** or **unknown**.

### Example: resolved

```json
{
  "kind": "resolved",
  "resolution": {
    "rawInput": "קריית שמונה",
    "normalizedInput": "קריית שמונה",
    "canonicalKey": "kiryat_shmona",
    "matchedName": "קריית שמונה",
    "matchedVariant": "קריית שמונה",
    "matchMethod": "exact",
    "matchConfidence": 1,
    "candidateCount": 1,
    "geoEntityType": "locality"
  },
  "classification": {
    "pboSubregionId": "naftali",
    "geoAreaTags": ["north", "upper_galilee_adjacent"],
    "isGolan": false,
    "distanceKmToNorthBorder": 12.4,
    "distanceBand": "10-25",
    "distanceSemantics": "point_to_polyline"
  },
  "policy": {
    "geoPolicyVersion": "geo-policy-2026-05-v2",
    "quality": "high",
    "usableForMetrics": true,
    "requiresReview": false,
    "scopeConfidence": "high",
    "decisionReasons": ["deterministic_match"]
  },
  "audit": {
    "geoReferenceVersion": "north-geo-2026-05-10",
    "borderReferenceVersion": "north-border-2026-05-10",
    "source": "north-localities-v1",
    "resolvedAt": "2026-05-12T00:00:00.000Z"
  },
  "scopeDecision": {
    "isNorthRelevant": true,
    "source": "geo_tags",
    "confidence": "high",
    "usableForMetrics": true,
    "reasons": ["geoAreaTags includes north"]
  },
  "geoEntityType": "locality",
  "matchEvidence": {
    "rawInput": "קריית שמונה",
    "normalizedInput": "קריית שמונה",
    "matchedVariant": "קריית שמונה",
    "candidateCount": 1
  },
  "scopeConfidence": "high",
  "geoPolicyVersion": "geo-policy-2026-05-v2",
  "geoReferenceVersion": "north-geo-2026-05-10",
  "borderReferenceVersion": "north-border-2026-05-10",
  "source": "north-localities-v1",
  "canonicalKey": "kiryat_shmona",
  "matchedName": "קריית שמונה",
  "pboSubregionId": "naftali",
  "subregionId": "naftali",
  "geoAreaTags": ["north", "upper_galilee_adjacent"],
  "distanceKmToNorthBorder": 12.4,
  "distanceBand": "10-25",
  "isGolan": false,
  "matchMethod": "exact",
  "matchConfidence": 1,
  "quality": "high",
  "usableForMetrics": true,
  "requiresReview": false
}
```

(**`subregionId`** is omitted from JSON when **`GEO_LEGACY_SUBREGION_ID`** is **`0`** or **`false`** — see below.)

- **Nested contract (`resolution` / `classification` / `policy` / `audit` / `scopeDecision`)** — the app **dual-writes** grouped sub-objects while keeping flat fields for backward compatibility.
  - **Nested fields are canonical.** Flat fields are **deprecated compatibility aliases** — do not read them in new code; do not add new consumers that depend on flat keys.
  - **Migration (read path):**

```js
// Preferred — nested only
const pbo = geo?.classification?.pboSubregionId;
const metricsOk = geo?.policy?.usableForMetrics;
const refVer = geo?.audit?.geoReferenceVersion;
const northFromGeo = geo?.scopeDecision;

// Legacy only — do not copy this pattern into new modules
const pboLegacy = geo?.pboSubregionId;
```

- **Full `geoEntityType` enum** (validated in [`geoEnrichmentSchema.js`](../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js)): `locality`, `municipality`, `regional_council`, `pbo_subregion`, `district`, `area`, `subregion`, `border_zone`, `facility`, `unknown`. Most resolves use **`locality`**; reference rows may set **`regional_council`** / **`municipality`**; macro unmatched strings may yield **`area`** in unknown resolution hints.
- **Macro vs table** — broad area strings (e.g. **צפון**) become **`NON_LOCALITY_AREA_TERM`** only **after** there is no reference row match, so names present in **`north-reference.json`** (e.g. **גולן**) still resolve as reference rows.
- **`classification.distanceSemantics`** (optional on envelope, always set for **resolved** today) — documents how **`distanceKmToNorthBorder`** was derived: **`point_to_polyline`** (locality pin) vs **`representative_centroid_to_polyline`** (administrative / area proxy pin). Distances remain numeric; semantics are for audit and downstream policy.
- **`geoPolicyVersion`** — version string for *policy* (distinct from reference/border data versions). **`geo-policy-2026-05-v2`** tightens **`usableForMetrics`** / **`quality`** for **`regional_council`** (and related centroid-only entity types): deterministic matches to those types are capped at **`medium`** quality, **`usableForMetrics: false`**, **`requiresReview: true`**, and **`policy.decisionReasons`** includes **`centroid_geometry_only`** when applicable (see [`geoQualityPolicy.js`](../business_modules/geo/domain/services/geoQualityPolicy.js)).
- **`matchEvidence`** — deterministic audit for matching: **`rawInput`**, NFKC-normalized lookup key (**`normalizedInput`**), display **`matchedVariant`**, and **`candidateCount`** (for fuzzy wins: count of reference rows scoring above the fuzzy floor; **`1`** for exact / punctuation / Hebrew-final paths).
- **`scopeConfidence`** — **`high`** | **`medium`** | **`low`**: trust for **north-scoped analytics**, separate from string **`matchConfidence`**. v1 is derived from **`usableForMetrics`** / **`requiresReview`** via [`deriveScopeConfidence`](../business_modules/geo/domain/services/geoQualityPolicy.js); later it may incorporate **`sourceType`** or reporter hints without overloading **`usableForMetrics`**.
- **`pboSubregionId`** — administrative bucket aligned with PBO north regions (`naftali`, `golan`, `baram`, `hiram`, `galma`). Same values as [`regionalPboRegions.js`](../business_modules/pbo_report_regional/domain/value_objects/regionalPboRegions.js); parity is tested under `tests/business_modules/geo/`.
- **`subregionId`** — **deprecated:** duplicate of `pboSubregionId`. **Default:** omitted (`GEO_LEGACY_SUBREGION_ID` defaults to off). Set **`GEO_LEGACY_SUBREGION_ID=1`** only for legacy consumers.
- **`envelopeSchemaVersion`** — e.g. `geo-envelope-2026-05-v1` on all new envelopes.
- **`geoAreaTags`** — derived tags (e.g. `north`, `golan_heights`, `galilee`); see [`geoAreaTagsForPboSubregion.js`](../business_modules/geo/domain/services/geoAreaTagsForPboSubregion.js). Prefer tags over **`isGolan`** alone for new logic.
- **`geoReferenceVersion` / `borderReferenceVersion` / `source`** — reproducibility: which dataset and border snapshot produced this row.
- **`quality`** — `high` | `medium` | `low`: derived from **`matchMethod`** and **`matchConfidence`** (see [`geoQualityPolicy.js`](../business_modules/geo/domain/services/geoQualityPolicy.js)).
- **`usableForMetrics`** — `true` when aggregates may treat this row as trusted (deterministic match stages, or fuzzy with confidence ≥ **0.95**).
- **`requiresReview`** — `true` for fuzzy matches or when **`quality`** is `low` (operational queue / manual spot-check).

### Consumer rules (recommended)

1. **Metrics and dashboards** — only count a resolved locality toward north metrics when **`usableForMetrics === true`**. Treat **`usableForMetrics === false`** as “geographic hint only” (do not drive hard KPIs).
2. **North scope / filters** — prefer **`pboSubregionId`** and **`geoAreaTags`**; do not rely on **`subregionId`** (deprecated duplicate).
3. **Unknowns** — preserve full **`geo`** on signals for audit; optionally enable the JSONL review sink (below) to accumulate raw names for **`north-reference.json`** expansion.
4. **Envelope shape** — use **`validateGeoEnvelope()`** from [`geoEnrichmentSchema.js`](../business_modules/geo/domain/value_objects/geoEnrichmentSchema.js) (or the re-export in [`signalGeoSummary.js`](../cross-cut-modules/geo/signalGeoSummary.js)) in tests or when **`GEO_ASSERT_ENVELOPE=1`** in WhatsApp attach (catches drift before persist).
5. **North-scoped narrative vs string match** — use **`scopeConfidence`** (and **`usableForMetrics`**) for “should this signal drive north analytics?”; use **`matchConfidence`** / **`matchEvidence`** for “did we match the text to the right reference row?”.

### Example: unknown (no table match)

```json
{
  "kind": "unknown",
  "reason": "NO_MATCH",
  "rawName": "Some Unknown Council",
  "geoReferenceVersion": "north-geo-2026-05-10",
  "source": "north-localities-v1"
}
```

### Example: unknown (ambiguous fuzzy)

When fuzzy matching cannot pick a single locality confidently, **`reason`** is **`NO_CONFIDENT_MATCH`** and **`candidates`** lists top options with scores.

```json
{
  "kind": "unknown",
  "reason": "NO_CONFIDENT_MATCH",
  "rawName": "כרמיאל",
  "geoReferenceVersion": "north-geo-2026-05-10",
  "source": "north-localities-v1",
  "candidates": [
    { "canonicalKey": "locality_a", "score": 0.89 },
    { "canonicalKey": "locality_b", "score": 0.88 }
  ]
}
```

(Shape illustrative; scores are rounded in output.)

### Example: unknown (geo disabled / NoOp port)

```json
{
  "kind": "unknown",
  "reason": "GEO_DISABLED",
  "rawName": null,
  "geoReferenceVersion": null
}
```

### Example: unknown (no locality string)

```json
{
  "kind": "unknown",
  "reason": "NO_LOCALITY",
  "rawName": null,
  "geoReferenceVersion": "north-geo-2026-05-10",
  "source": "north-localities-v1"
}
```

Implementation reference: [`geoService.js`](../business_modules/geo/app/geoService.js), typedefs in [`geoEnrichment.js`](../business_modules/geo/domain/value_objects/geoEnrichment.js).

---

## Reference data (versioned)

All files live under [`business_modules/geo/data/`](../business_modules/geo/data/).

### `north-reference.json` (primary)

| Top-level field | Purpose |
|-----------------|--------|
| `version` | Copied to **`geoReferenceVersion`** on every resolve |
| `source` | Logical dataset id (e.g. `north-localities-v1`), copied to **`source`** on the envelope |
| `description` | Human notes for maintainers |
| `schema` | Optional; e.g. `north-reference-subregions-v1` when rows are grouped under **`subregions.<pboId>.localities`** |
| `subregions` | Preferred: map of PBO ids → **`{ localities: [...] }`** (each row omits redundant **`subregionId`**; parent key is authoritative) |
| `localities` | Legacy flat array of locality rows (still supported) |

Each **locality** row supports:

| Field | Required | Notes |
|-------|----------|--------|
| `canonicalKey` | yes | Stable slug, e.g. `kiryat_shmona` |
| `names` | yes | Lookup strings (Hebrew / English) |
| `aliases` | no | Merged into the internal name list at load time (same as extra `names`) |
| `lat`, `lon` | yes | WGS84 degrees |
| `subregionId` | yes | One of the five PBO north ids (omitted when nested under **`subregions.*`** — injected at load) |
| `officialHebrewName`, `municipalityType`, `parentCouncilKey` | no | Metadata for reports / future UI |
| `geoEntityType` | no | `locality` (default), `municipality`, or `regional_council`; drives resolve **`geoEntityType`**, **`classification.distanceSemantics`**, and metrics policy for centroid-only types |

**Legacy:** If **`north-reference.json`** is missing but **`north-localities.json`** exists as a **flat JSON array**, the adapter loads it with `referenceVersion: 'legacy-array'`.

### `north-border.json`

| Field | Purpose |
|-------|--------|
| `version` | **`borderReferenceVersion`** on resolved envelopes |
| `description` | Disclaimer: simplified polyline, not a legal boundary |
| `coordinates` | `[{ "lat", "lon" }, ...]` — open polyline for minimum distance |

Changing either file’s **`version`** (or the geometry/table) changes downstream km and bands; bump versions when you intentionally change analytics semantics.

---

## Matching pipeline (all inside `geo`)

Order of attempts ([`resolveLocalityMatch.js`](../business_modules/geo/domain/services/resolveLocalityMatch.js), [`localityStringSimilarity.js`](../business_modules/geo/domain/services/localityStringSimilarity.js)):

1. **Exact** — NFKC, trim, lower case, collapsed whitespace.
2. **Punctuation** — strip quotes and common punctuation, then lookup again.
3. **Transliteration** — common English spellings (e.g. `Kiryat Shmona`) map to Hebrew keys before fuzzy.
4. **Hebrew final letters** — map final forms (e.g. ם → מ) with/without step 2.
5. **Manual override** — SQLite-backed **`lookupOverride`** (if configured), before fuzzy.
6. **Fuzzy** — Dice bigram similarity (prefix-bucketed for scale); accept only if score ≥ **0.88** and the best score beats the runner-up by at least **0.02**, with optional **`reporterSubregionHint`** tie-break; otherwise **`NO_CONFIDENT_MATCH`** with **`candidates`**.
7. **Macro area terms** — only if steps 1–6 produced no match (conservative): conservative **`NON_LOCALITY_AREA_TERM`** for strings like **צפון** / **הגליל** (see [`geoService.js`](../business_modules/geo/app/geoService.js)).

**`matchMethod`** on resolved values reflects the winning stage (`exact`, `punctuation`, `hebrew_final`, or `fuzzy`). Aliases from JSON are merged into the name list at load time, so they typically resolve as **`exact`**, not a separate `alias` method. **`matchConfidence`** is `1` for the deterministic stages, or the fuzzy score when fuzzy wins.

**Distance bands** ([`distanceBand.js`](../business_modules/geo/domain/services/distanceBand.js) + [`distance-band-policy.json`](../business_modules/geo/data/distance-band-policy.json)): `0-10`, `10-25`, `25+` km to the border polyline, or `unknown` if the distance is non-finite. Resolved envelopes include **`classification.distancePolicyVersion`**.

---

## Where `geo` is attached today

### WhatsApp field signals

[`whatsappResilienceAnalyzer.js`](../business_modules/whatsapp/app/whatsappResilienceAnalyzer.js) uses [`attachGeoToSignalsAndStructured`](../cross-cut-modules/geo/attachGeoToSignals.js):

- Per signal: **`signal.locality`**, evidence heuristics, then message-level **`structured.observation.locality`** as fallback.
- **`resolution.scope`**: `signal` | `message` on each envelope for audit.
- **`structured.observation.geo`** mirrors observation-level resolve for UI.

Set **`GEO_ASSERT_ENVELOPE=1`** in the server environment to throw if the resolved **`geo`** object fails **`validateGeoEnvelope`** immediately after attach (guards against contract drift in production).

When **`geoEnrichmentPort`** is omitted, the factory uses **`NoOpGeoEnrichmentPort`** (unknown `GEO_DISABLED`). In production, [`app.js`](../app.js) passes the real adapter.

Persisted WhatsApp JSON on disk will include **`geo`** on each signal object whenever the live analyzer ran with the adapter.

### News / radio (`assess-signals` and optional extract)

[`assess-signals.js`](../business_modules/resilience/input/assess-signals.js) always attaches **`geo`** to **`news`** and **`radio`** signals (before north scope filter) via deterministic locality inference on evidence ([`localityCandidate.js`](../cross-cut-modules/geo/localityCandidate.js)).

Set **`GEO_ATTACH_ON_EXTRACT=1`** when running [`extract-signals.js`](../business_modules/resilience/input/extract-signals.js) to persist **`geo`** on written `signals/signals-{type}-{date}.json` files.

### Survey (field survey CLI)

1. **`npm run analyze-survey`** runs [`scripts/analyze-survey.mjs`](../scripts/analyze-survey.mjs), which builds `geoService` + **`createGeoEnrichmentAdapter`** and calls **`runAnalyzeSurveyCli({ geoEnrichmentPort })`**.
2. [`analyzeSurveyInput.js`](../business_modules/resilience/input/analyzeSurveyInput.js) attaches **`m.geo`** to each municipality in **`assessment.municipalities`** after the LLM run, logs a one-line summary to stderr, then writes reports.
3. [`surveyReportWriter.js`](../business_modules/resilience/app/surveyReportWriter.js) adds a **“Geo enrichment”** section when **`mun.geo`** is present. For **`kind: 'resolved'`**, it first emits a short **Markdown summary line** (italic) with **`geoReferenceVersion`**, **`borderReferenceVersion`** (or `n/a`), **`quality`**, **`usableForMetrics`**, and **`requiresReview`** — same audit dimensions as resilience report JSON (see below), optimized for a quick human skim. It then prints a fenced **`json`** block with the **full envelope**. For **`kind: 'unknown'`**, only the **`json`** block is printed (no summary line).

Running **`node business_modules/resilience/input/analyze-survey.js`** directly does **not** inject the port (no geo in output unless you add a composition script).

### HTTP: internal resolve API

- **Route:** `GET /api/geo/resolve?name=...` or **`?q=...`**
- **Plugin:** [`business_modules/geo/input/geoRoutes.js`](../business_modules/geo/input/geoRoutes.js)
- **Handler:** uses **`request.server.geoService`** (same instance as `createGeoService` in `app.js`).
- **Auth:** uses the same optional **`authPreHandler`** pattern as drift/overrides when Firebase auth is enabled.
- **OpenAPI:** [`openapi/openapi.yaml`](../openapi/openapi.yaml), tag **Geo**.

Use this for debugging, admin tools, or future UI — not as a public geocoder.

### Fastify decoration

[`app.js`](../app.js) registers **`app.decorate('geoService', geoService)`** so any route can call **`request.server.geoService.resolveLocalityName(...)`** without importing the module.

---

## North scope: `regionSignalFilter`

[`regionSignalFilter.js`](../business_modules/resilience/domain/services/regionSignalFilter.js) decides whether a signal counts as **north** for scoped reporting:

1. Certain **`source_type`** values are always north (field, PBO, WhatsApp, etc.).
2. If **`signal.geo.kind === 'resolved'`** and tags / PBO id indicate the configured north set, the signal is **north** even when the evidence text has no keyword hit — **unless** **`usableForMetrics`** is explicitly **`false`**, in which case that geo-derived north hint is ignored (low-confidence fuzzy / non-metrics-safe rows still fall through to keywords or other rules).
3. Otherwise the existing **`NORTH_TERMS`** substring list is used (**legacy fallback** for signals without **`geo`**, or when geo alone must not count as verified north).

**Legacy keyword list:** substring matching on evidence remains a **best-effort** path for older payloads; prefer resolved **`geo`** with **`usableForMetrics: true`** when present.

### `scopeDecision`: geo envelope vs signal

- **`geo.scopeDecision`** (resolved envelopes only) — built by [`buildGeoScopeDecision`](../business_modules/geo/domain/services/geoScopeDecisionFromResolved.js) inside `geoService`. Explains north relevance **from tags + PBO id + `usableForMetrics` only** (`source`: `geo` | `geo_tags` | `pbo_subregion` | `unknown`). Persisted on `signal.geo` so a stored geo blob answers “was this geo, on its own, allowed to count as north-from-geo?”
- **`signal.scopeDecision`** — attached by [`filterSignalsForScope`](../business_modules/resilience/domain/services/regionSignalFilter.js): full north filter including **`source_type`**, resolved geo (with the same metrics gate), and **`keyword_fallback`**. Use this for “why did this signal enter north-scoped analysis?”

`filterSignalsForScope()` maps each signal to include **`signal.scopeDecision`**:

- `isNorthRelevant`
- `source`: `source_type` | `geo_tags` | `pbo_subregion` | `geo` | `keyword_fallback` | `unknown`
- `confidence`: `high` | `medium` | `low`
- `reasons`: short list of strings describing the decision

This makes north scoping explainable in dashboards and during audits.

---

## Aggregations and CLI summaries

Pure helpers in [`geoAggregation.js`](../business_modules/geo/domain/services/geoAggregation.js):

- **`groupSignalsBySubregion(items)`** — groups by `pboSubregionId`, or `_unknown`, or `_no_geo` if the item has no `geo` field.
- **`groupSignalsByDistanceBand(items)`** — groups by `distanceBand` when resolved.
- **`summarizeGeoCoverage(items)`** — only considers items that **own** a **`geo`** property; reports `withGeoField`, `resolved`, `unknown`, **`pctResolved`**, and sample raw names for unknowns.
- **`summarizeGeoQuality(items)`** — **`pctUsableForMetrics`**, **`pctRequiresReview`**, breakdowns by **`source_type`** / **`matchMethod`**, top unknown raw names.

[`assess-signals.js`](../business_modules/resilience/input/assess-signals.js) prints geo coverage and quality lines when signals carry **`geo`**. Report **`methodology.scope.geo_quality_summary`** is populated when any signal has **`geo`**.

### Report JSON: geo reference versions

[`reportWriter.js`](../business_modules/resilience/infrastructure/reportWriter.js) adds audit fields next to **`signals`** when writing assessment JSON:

- **`geo_reference_versions_used`** — sorted unique **`geoReferenceVersion`** values from resolved signal **`geo`** envelopes.
- **`border_reference_versions_used`** — sorted unique **`borderReferenceVersion`** values (non-null only).

These use **snake_case** keys in the written JSON file (not camelCase) for consistency with other top-level report fields.

Use these when a report mixes evidence from different ingest runs or after bumping **`north-reference.json`** / **`north-border.json`** versions. Survey Markdown uses the same version and quality fields in the **Geo enrichment** summary line above; there is no separate survey JSON artifact for “versions used” unless you add one later.

---

## Unknown locality review sink (optional)

When **`GEO_UNKNOWN_REVIEW_JSONL=1`**, [`app.js`](../app.js) and [`scripts/analyze-survey.mjs`](../scripts/analyze-survey.mjs) wire a JSONL sink ([`geoUnknownJsonlSinkAdapter.js`](../business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.js)) into **`GeoEnrichmentAdapter`**. Each **`NO_MATCH`** / **`NO_CONFIDENT_MATCH`** resolution appends one JSON line under **`business_modules/geo/data/review/unknown-localities.jsonl`** (directory created on first write). Implement **`IGeoUnknownSinkPort`** for other backends (e.g. SQLite) if you need dashboards.

### SQLite review queue (recommended for ops)

When **`GEO_UNKNOWN_REVIEW_SQLITE=1`**, composition wires a SQLite-backed queue ([`geoUnknownSqliteQueueAdapter.js`](../business_modules/geo/infrastructure/adapters/geoUnknownSqliteQueueAdapter.js)). Each unknown resolution increments an `occurrence_count` keyed by normalized raw name + reason + source type, and tracks first/last seen timestamps and last candidates JSON. This is the preferred backend for operational review workflows; JSONL remains useful for lightweight grepping.

### Manual overrides (approved aliases)

When **`GEO_OVERRIDES_SQLITE=1`**, composition wires a SQLite-backed overrides adapter ([`geoLocalityOverridesSqliteAdapter.js`](../business_modules/geo/infrastructure/adapters/geoLocalityOverridesSqliteAdapter.js)). Overrides are applied **after deterministic exact stages** and **before fuzzy**, producing a resolved envelope with `matchMethod: "manual_override"`. Use this to turn recurring officer spellings into deterministic matches without loosening fuzzy rules.

---

## Evidence SQLite (not yet extended)

[`evidenceStore.js`](../cross-cut-modules/persistence/evidenceStore.js) **`evidence_items`** rows do **not** include a `geo_json` column. Strategy: **`geo` on signal JSON** (and eventually rich blobs like `report_json`) first.

**When to add extracted SQLite columns** (e.g. `geo_kind`, `geo_pbo_subregion_id`, `geo_distance_band`): only when you have a concrete need for **SQL-level time-series**, filtering, or joins on geo fields that cannot be satisfied by loading signal JSON or report JSON. Until then, keep **signals-first** evidence and use report **`geo_reference_versions_used`** for version audit.

---

## Related but non-`geo` behavior

| Feature | Role |
|---------|------|
| **PBO regional daily files** | Five region ids + markdown on disk under `pbo_report_regional/data` |
| **Resilience LLM prompts** | Narrative scope (Israel-only, Naftali vs whole north, etc.) — policy, not metrics |
| **Keyword list in `regionSignalFilter`** | Legacy fallback when **`geo`** is missing, not resolved, or not metrics-safe (`usableForMetrics === false`) |

---

## Module layout (`geo`)

```text
business_modules/geo/
├── index.js                    # barrel: createGeoService, adapter factories, distance helpers,
│                               #   aggregations, registerGeoRoutes, northSubregionId helpers, …
├── app/geoService.js
├── domain/
│   ├── ports/IGeoNorthReferencePort.js
│   ├── value_objects/ (northSubregionId, geoEnrichment)
│   └── services/ (distance, matching, aggregation, area tags)
├── infrastructure/adapters/
│   ├── geoNorthReferenceJsonAdapter.js
│   └── geoUnknownJsonlSinkAdapter.js   # optional review backlog (GEO_UNKNOWN_REVIEW_JSONL=1)
├── data/north-reference.json
├── data/north-border.json
└── input/geoRoutes.js          # Fastify routes
```

---

## Tests (quick index)

| Topic | Location |
|-------|----------|
| PBO id parity with `geo` | `tests/business_modules/geo/northSubregionId.parity.test.js` |
| Service, JSON adapter, distance math | `tests/business_modules/geo/` |
| Quality policy + envelope schema + report version collector | `tests/business_modules/geo/domain/services/`, `tests/business_modules/geo/domain/value_objects/geoEnrichmentSchema.test.js` |
| Unknown JSONL sink | `tests/business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.test.js` |
| `GeoEnrichmentAdapter` / NoOp | `tests/business_modules/resilience/infrastructure/adapters/geoEnrichmentAdapter.test.js` |
| North filter + resolved `geo` | `tests/business_modules/resilience/domain/services/regionSignalFilter.test.js` |

Run **`npm test`** from the repository root.

---

## Operations checklist

1. **Expand coverage** — add rows to **`localities`** in `north-reference.json`; bump **`version`** when you change assignments or names in a way that affects analytics.
2. **Change border geometry** — edit `north-border.json` coordinates and bump its **`version`**.
3. **Wire new consumers** — inject **`IGeoEnrichmentPort`** (adapter or NoOp) from `app.js` or a thin `scripts/*.mjs` entry; do not import `geo` from other business modules.
4. **Debug a name** — `GET /api/geo/resolve?name=...` (with auth if enabled) or a small Node snippet using `createGeoService` + the JSON adapter.
5. **Collect unknown localities for review** — set **`GEO_UNKNOWN_REVIEW_JSONL=1`** when running the app or **`npm run analyze-survey`** so **`NO_MATCH`** / **`NO_CONFIDENT_MATCH`** rows append to **`business_modules/geo/data/review/unknown-localities.jsonl`** (see [Unknown locality review sink](#unknown-locality-review-sink-optional)).
6. **Drop legacy `subregionId` from new payloads** — set **`GEO_LEGACY_SUBREGION_ID=0`** (or **`false`**) once all in-repo consumers use **`pboSubregionId`** only; keep **`1`** (default) until external clients have migrated.

---

## Roadmap (contract and operations)

The current **flat resolved envelope** is intentional for shipping speed. The following items are **directional** — prioritize semantic clarity and auditability before large migrations.

| Priority | Item | Notes |
|----------|------|--------|
| 1 | **`geoEntityType`** | Shipped for **`locality`**; extend enum when regional councils, cities-as-whole, macro areas, and vague “צפון” inputs are modeled. Distance-to-border semantics should vary by type (e.g. council ≠ point). |
| 2 | **`matchEvidence`** | Shipped (`rawInput`, `normalizedInput`, `matchedVariant`, `candidateCount`). Helps admin review of noisy PBO / WhatsApp strings. |
| 3 | **SQLite extracted geo columns** | Denormalize `geo_kind`, PBO id, band, quality, metrics flags, reference versions for dashboards; **keep** full **`geo`** JSON on the signal. |
| 4 | **Manual override table** | Durable corrections (`raw_name` → `canonical_key`) with resolution order: reference → **override** → normalized → fuzzy → unknown. JSONL sink remains useful for discovery. |
| 5 | **Versioned distance-band policy** | Move `0-10` / `10-25` / `25+` thresholds to a versioned policy file; add **`distancePolicyVersion`** on the envelope when bands become analytics policy, not just geometry. |
| 6 | **Split envelope: resolution / classification / audit** | Group fields so PBO or border policy can change without conflating “which locality won” with “which subregion tag applies”. Migrate behind a version flag when ready. |
| 7 | **`subregionId` removal** | Emit only **`pboSubregionId`** after migration window; add consumer tests that never read **`subregionId`**. **`GEO_LEGACY_SUBREGION_ID`** is the interim switch. |
| 8 | **Source-aware `resolveLocalityName`** | Optional second argument (`sourceType`, `reporterRegionHint`, …) for **deterministic** tie-breaks only — not LLM geography. |
| 9 | **`scopeConfidence`** | Shipped (v1 from metrics policy). Evolve when source hints and entity types feed north analytics separately from string **`matchConfidence`**. |
| 10 | **Geo coverage KPIs** | Formalize `% with geo`, `% resolved`, `% usableForMetrics`, `% requiresReview`, top unknowns / fuzzies, by **`source_type`** and reference version — ops dashboard or admin report. |

---

## Revision history

| Date | Change |
|------|--------|
| 2026-05 | Initial canonical enrichment: versioned `north-reference.json` / `north-border.json`, `IGeoEnrichmentPort`, WhatsApp + survey attachment, fuzzy stages, aggregations, `regionSignalFilter` geo branch, `/api/geo/resolve`, signals-first evidence strategy. |
| 2026-05 | Quality fields (`quality`, `usableForMetrics`, `requiresReview`), `validateGeoEnvelope`, report `geo_reference_versions_used` / `border_reference_versions_used`, deprecate **`subregionId`** for new consumers, optional JSONL unknown sink, `GEO_ASSERT_ENVELOPE` on WhatsApp attach, `usableForMetrics` gate in north-from-geo. |
| 2026-05 | **`geoEntityType`**, **`matchEvidence`**, **`scopeConfidence`**; fuzzy **`candidateCount`**; **`GEO_LEGACY_SUBREGION_ID`** to omit deprecated **`subregionId`**; roadmap table for split envelope, SQLite columns, overrides, distance policy versioning, KPIs, and source-aware resolve. |
| 2026-05 | **`geo.scopeDecision`** on resolved envelopes (geo-only north hint audit); stricter doc rule: nested fields canonical, flat deprecated; full **`geoEntityType`** enum called out in guide. |
| 2026-05 | News/radio geo attach in **`assess-signals`**; **`GEO_ATTACH_ON_EXTRACT`**; per-signal WhatsApp geo; **`northRelevanceFromResolvedGeo`**; **`summarizeGeoQuality`**; transliteration pass; versioned distance-band policy; **`createGeoWiring`**; CI north-terms sync check; default omit **`subregionId`**. |
