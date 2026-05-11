# Geographic enrichment — developer guide

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

**Boundary rule:** resilience/survey/whatsapp **must not** import `business_modules/geo` for enrichment. Use the port; build the adapter at the app or script entrypoint.

---

## The `geo` envelope (contract)

Every consumer should treat **`geo`** as an optional field. Shape is always either **resolved** or **unknown**.

### Example: resolved

```json
{
  "kind": "resolved",
  "geoEntityType": "locality",
  "matchEvidence": {
    "rawInput": "קריית שמונה",
    "normalizedInput": "קריית שמונה",
    "matchedVariant": "קריית שמונה",
    "candidateCount": 1
  },
  "scopeConfidence": "high",
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

- **`geoEntityType`** — what the input string is being treated as today. The north table is locality-centric, so resolves emit **`locality`** until regional councils, macro areas, and mixed inputs are modeled (`municipality`, `regional_council`, `area`, `subregion`, `unknown`).
- **`matchEvidence`** — deterministic audit for matching: **`rawInput`**, NFKC-normalized lookup key (**`normalizedInput`**), display **`matchedVariant`**, and **`candidateCount`** (for fuzzy wins: count of reference rows scoring above the fuzzy floor; **`1`** for exact / punctuation / Hebrew-final paths).
- **`scopeConfidence`** — **`high`** | **`medium`** | **`low`**: trust for **north-scoped analytics**, separate from string **`matchConfidence`**. v1 is derived from **`usableForMetrics`** / **`requiresReview`** via [`deriveScopeConfidence`](../business_modules/geo/domain/services/geoQualityPolicy.js); later it may incorporate **`sourceType`** or reporter hints without overloading **`usableForMetrics`**.
- **`pboSubregionId`** — administrative bucket aligned with PBO north regions (`naftali`, `golan`, `baram`, `hiram`, `galma`). Same values as [`regionalPboRegions.js`](../business_modules/pbo_report_regional/domain/value_objects/regionalPboRegions.js); parity is tested under `tests/business_modules/geo/`.
- **`subregionId`** — **deprecated:** duplicate of `pboSubregionId` for backward compatibility only. Do not read this field in new code; use **`pboSubregionId`** (and tags). Set **`GEO_LEGACY_SUBREGION_ID=0`** (or **`false`**) in the server environment to **stop emitting** this field on new resolves.
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
| `localities` | Array of locality rows |

Each **locality** row supports:

| Field | Required | Notes |
|-------|----------|--------|
| `canonicalKey` | yes | Stable slug, e.g. `kiryat_shmona` |
| `names` | yes | Lookup strings (Hebrew / English) |
| `aliases` | no | Merged into the internal name list at load time (same as extra `names`) |
| `lat`, `lon` | yes | WGS84 degrees |
| `subregionId` | yes | One of the five PBO north ids |
| `officialHebrewName`, `municipalityType`, `parentCouncilKey` | no | Metadata for reports / future UI |

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
3. **Hebrew final letters** — map final forms (e.g. ם → מ) with/without step 2.
4. **Fuzzy** — Dice bigram similarity over all names; accept only if score ≥ **0.88** and the best score beats the runner-up by at least **0.02**; otherwise **`NO_CONFIDENT_MATCH`** with **`candidates`**.

**`matchMethod`** on resolved values reflects the winning stage (`exact`, `punctuation`, `hebrew_final`, or `fuzzy`). Aliases from JSON are merged into the name list at load time, so they typically resolve as **`exact`**, not a separate `alias` method. **`matchConfidence`** is `1` for the deterministic stages, or the fuzzy score when fuzzy wins.

**Distance bands** ([`distanceBand.js`](../business_modules/geo/domain/services/distanceBand.js)): `0-10`, `10-25`, `25+` km to the border polyline, or `unknown` if the distance is non-finite.

---

## Where `geo` is attached today

### WhatsApp field signals

[`whatsappResilienceAnalyzer.js`](../business_modules/whatsapp/app/whatsappResilienceAnalyzer.js):

- After **`structured.observation.locality`** is set (LLM + heuristics), the analyzer calls **`geoEnrichmentPort.resolveLocalityName(locality)`**.
- **Every signal** in the returned array gets a **`geo`** field (same envelope for all signals in that message turn — message-level locality).
- **`structured.observation.geo`** is set to the same envelope for UI / downstream consumers.

Set **`GEO_ASSERT_ENVELOPE=1`** in the server environment to throw if the resolved **`geo`** object fails **`validateGeoEnvelope`** immediately after attach (guards against contract drift in production).

When **`geoEnrichmentPort`** is omitted, the factory uses **`NoOpGeoEnrichmentPort`** (unknown `GEO_DISABLED`). In production, [`app.js`](../app.js) passes the real adapter.

Persisted WhatsApp JSON on disk will include **`geo`** on each signal object whenever the live analyzer ran with the adapter.

### Survey (field survey CLI)

1. **`npm run analyze-survey`** runs [`scripts/analyze-survey.mjs`](../scripts/analyze-survey.mjs), which builds `geoService` + **`createGeoEnrichmentAdapter`** and calls **`runAnalyzeSurveyCli({ geoEnrichmentPort })`**.
2. [`analyzeSurveyInput.js`](../business_modules/resilience/input/analyzeSurveyInput.js) attaches **`m.geo`** to each municipality in **`assessment.municipalities`** after the LLM run, logs a one-line summary to stderr, then writes reports.
3. [`surveyReportWriter.js`](../business_modules/survey/app/surveyReportWriter.js) adds a **“Geo enrichment”** section when **`mun.geo`** is present. For **`kind: 'resolved'`**, it first emits a short **Markdown summary line** (italic) with **`geoReferenceVersion`**, **`borderReferenceVersion`** (or `n/a`), **`quality`**, **`usableForMetrics`**, and **`requiresReview`** — same audit dimensions as resilience report JSON (see below), optimized for a quick human skim. It then prints a fenced **`json`** block with the **full envelope**. For **`kind: 'unknown'`**, only the **`json`** block is printed (no summary line).

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

---

## Aggregations and CLI summaries

Pure helpers in [`geoAggregation.js`](../business_modules/geo/domain/services/geoAggregation.js):

- **`groupSignalsBySubregion(items)`** — groups by `pboSubregionId`, or `_unknown`, or `_no_geo` if the item has no `geo` field.
- **`groupSignalsByDistanceBand(items)`** — groups by `distanceBand` when resolved.
- **`summarizeGeoCoverage(items)`** — only considers items that **own** a **`geo`** property; reports `withGeoField`, `resolved`, `unknown`, **`pctResolved`**, and sample raw names for unknowns.

[`assess-signals.js`](../business_modules/resilience/input/assess-signals.js) prints a **one-line geo coverage** summary when any loaded signal has **`geo`**, using the re-export [`cross-cut-modules/geo/signalGeoSummary.js`](../cross-cut-modules/geo/signalGeoSummary.js) so the CLI does not import `business_modules/geo` paths directly.

### Report JSON: geo reference versions

[`reportWriter.js`](../business_modules/resilience/infrastructure/reportWriter.js) adds audit fields next to **`signals`** when writing assessment JSON:

- **`geo_reference_versions_used`** — sorted unique **`geoReferenceVersion`** values from resolved signal **`geo`** envelopes.
- **`border_reference_versions_used`** — sorted unique **`borderReferenceVersion`** values (non-null only).

These use **snake_case** keys in the written JSON file (not camelCase) for consistency with other top-level report fields.

Use these when a report mixes evidence from different ingest runs or after bumping **`north-reference.json`** / **`north-border.json`** versions. Survey Markdown uses the same version and quality fields in the **Geo enrichment** summary line above; there is no separate survey JSON artifact for “versions used” unless you add one later.

---

## Unknown locality review sink (optional)

When **`GEO_UNKNOWN_REVIEW_JSONL=1`**, [`app.js`](../app.js) and [`scripts/analyze-survey.mjs`](../scripts/analyze-survey.mjs) wire a JSONL sink ([`geoUnknownJsonlSinkAdapter.js`](../business_modules/geo/infrastructure/adapters/geoUnknownJsonlSinkAdapter.js)) into **`GeoEnrichmentAdapter`**. Each **`NO_MATCH`** / **`NO_CONFIDENT_MATCH`** resolution appends one JSON line under **`business_modules/geo/data/review/unknown-localities.jsonl`** (directory created on first write). Implement **`IGeoUnknownSinkPort`** for other backends (e.g. SQLite) if you need dashboards.

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
