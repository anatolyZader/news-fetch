# Spec: Resilience business module (8-component assessment)

## Summary

Define a **`business_modules/resilience/`** module that **owns population-resilience analysis**: behavioral signal extraction, deterministic scoring, and narrative synthesis across the **eight Home Front Command (Fran Norris–based) components**. The module **does not fetch or filter** news or audio; it accepts **already prepared, clean content** from the **news-articles** and **audio** bounded contexts (or their adapters), runs the LLM + scoring pipeline, and persists or returns structured assessments.

---

## Goals

1. **Isolate resilience analysis** in one module with clear **app / domain / infrastructure** boundaries (hexagonal).
2. **Single entry use case** (application service): *given a batch of normalized content items + metadata, produce an assessment* (signals + scored components + narratives).
3. **Support two content kinds** from upstream modules: **`news`** (multi-source articles) and **`audio`** (spoken-audio transcript segments), via a **shared input contract** and kind-specific prompt behavior only where required.
4. **Preserve the eight components** as the authoritative assessment axes (IDs and definitions match `RESILIENCE_COMPONENTS` in domain).
5. **No direct coupling** to NewsAPI, Apify, ffmpeg, or ingest scripts inside this module — only **ports** and **DTOs** wired at the composition root.

---

## Out of scope (upstream modules)

- Fetching articles from external APIs (**news-articles** module).
- Home-front relevance filtering / keyword gates (**news-articles** or shared cross-cut).
- Audio transcription, diarization, chunking (**audio** module).
- Writing `articles-*.md` to disk (optional transport; not required for the core use case if callers pass DTOs).
- HTTP route registration (belongs in **`input/`** or host `createApp`; module exposes services, not necessarily Fastify).

---

## Bounded context

| Context | Responsibility |
|--------|----------------|
| **Resilience** | Map **clean behavioral evidence** in text → **closed-vocabulary signals** → **per-component scores + confidence** → **qualitative narratives** + optional **report artifacts**. |
| **News-articles** | Produce **filtered, deduplicated (if applicable) article-shaped items** for a date/run. |
| **Radio** | Produce **transcript-shaped items** (segments, station/program metadata) for a date/run. |

**Rule:** Resilience **never** imports application code from `business_modules/news-sites` or `business_modules/audio`. The host composes: ingest modules → **ResilienceInput DTO** → resilience app service.

---

## Canonical input: `ResilienceContentBatch` (DTO)

All upstream modules map their output into this shape (or the composition root maps file-based loaders into it).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reportDate` | `string` (`YYYY-MM-DD`) | Yes | Assessment date (may differ from item timestamps). |
| `contentKind` | `'news' \| 'audio'` | Yes | Selects prompt templates and dedupe policy hints. |
| `items` | `ResilienceContentItem[]` | Yes | Non-empty list of content units to analyze. |
| `sourceRunId` | `string` | No | Correlation id (e.g. fetch job id). |
| `priorAssessments` | `object[]` | No | Optional prior **assessment** objects for narrative continuity (same contract as today’s `priorReports`). |

### `ResilienceContentItem`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Stable id within the batch (e.g. index, url hash, segment id). |
| `title` | `string` | Yes | Headline or segment title/label. |
| `body` | `string` | Yes | Clean text used for extraction (length limits enforced in app layer). |
| `url` | `string` | No | Source link (news); omit or empty for audio transcripts if N/A. |
| `publishedAt` | `string` (ISO) | No | Publication/broadcast time. |
| `sourceLabel` | `string` | No | Site name, station, program, etc. |
| `metadata` | `object` | No | Opaque key/values (e.g. `speaker`, `program`); must not be required for core logic. |

**Validation (application layer):**

- Reject empty `items`.
- Enforce max body length per item (policy constant; align with current `STEP1_BODY_CHARS` / loader behavior).
- For `contentKind === 'news'`, upstream may dedupe by title; resilience may apply the same dedupe **only** if explicitly requested via option flag (preserve current CLI behavior).

---

## Output: `ResilienceAssessmentResult`

| Part | Description |
|------|-------------|
| `assessment` | Structured object: `date`, `total_articles_analyzed` (or `total_items_analyzed`), `overall_resilience_score`, `cross_component_synthesis`, `components[]` (each with `component_id`, `score`, `confidence`, `narrative`, manifestations, etc.) — **same schema as current report JSON `assessment`**. |
| `signals` | Array of extracted behavioral signals (type, polarity, evidence, url, …) — **same schema as current pipeline**. |
| `provenance` | `contentKind`, `itemCount`, optional `sourceRunId`, list of logical source labels. |

**Persistence** (optional port): write Markdown + JSON under `reports/` (or path from config) — **same filenames/convention as today** unless a later spec changes storage.

---

## Domain model (resilience module)

- **`RESILIENCE_COMPONENTS`**: eight component definitions (ids, names, guiding questions, behavioral manifestations) — **source of truth in `domain/resilienceComponents.js`**.
- **Signal taxonomy + scoring**: closed vocabulary and deterministic `scoreComponents` — **`domain/services/`** or `domain/value_objects/` as pure logic.
- **Port interfaces** (no I/O), e.g.:
  - `IResilienceLlmPort` — batch extract + narrative generation (implemented by Anthropic adapter in infrastructure).
  - `IResilienceReportWriterPort` — write assessment + signals to filesystem or blob store.
  - (Optional) `IResilienceCostPort` — usage/cost callbacks for caps.

---

## Application service (`app/resilienceAnalysisService.js`)

**Responsibilities:**

1. Validate `ResilienceContentBatch` and options (dedupe, prior assessments).
2. Call domain scoring pipeline steps in order:
   - Extract signals (via `IResilienceLlmPort` / orchestrated calls).
   - Score components from signals (pure domain).
   - Generate narratives + synthesis (via LLM port).
3. Invoke `IResilienceReportWriterPort` when persistence is requested.
4. Emit **progress / usage** events as callbacks (for SSE or CLI) — **no Fastify types** in the service signature.

**Signature (illustrative):**

```text
runAssessment(batch: ResilienceContentBatch, options?: {
  dedupeTitles?: boolean,
  onProgress?: (e) => void,
  onUsage?: (e) => void,
  persist?: boolean
}) → Promise<ResilienceAssessmentResult>
```

---

## Infrastructure adapters

| Adapter | Implements | Notes |
|---------|------------|--------|
| `anthropicResilienceLlmAdapter.js` | `IResilienceLlmPort` | Wraps current Haiku/Opus calls from legacy `claudeEvaluator.js`. |
| `resilienceReportFsAdapter.js` | `IResilienceReportWriterPort` | Writes `.md` + `.json` under configured root (`reports/`). |

Secrets (e.g. `ANTHROPIC_API_KEY`) are read only in infrastructure or bootstrap, not in domain.

---

## Input layer (`input/`)

Optional Fastify plugin or thin handlers that:

- Accept HTTP requests **only if** the product needs them; otherwise CLI/composition root calls the app service directly.
- Map HTTP body or file paths to `ResilienceContentBatch` **via adapters owned by the host or news/audio modules**, not inside domain.

---

## Composition (host)

- **News path:** `news-sites` (or future `news-articles` module) produces `ResilienceContentBatch` with `contentKind: 'news'`.
- **Audio path:** `audio` module produces `ResilienceContentBatch` with `contentKind: 'audio'`.
- **Wire** `IResilienceLlmPort` + `IResilienceReportWriterPort` into `resilienceAnalysisService` in **`compositionRoot.js`** (or equivalent).

---

## Non-goals (v1 of this spec)

- Replacing the eight components or merging with survey/event-log pipelines (those can remain separate scripts/modules until unified behind the same port pattern).
- Real-time streaming of partial component results (current batch model remains).

---

## Acceptance criteria

1. Resilience module **tests** can run **assessment** with **in-memory fake** `IResilienceLlmPort` and no filesystem.
2. No file under `business_modules/resilience/domain/` imports Fastify, `fs`, or `@anthropic-ai/sdk`.
3. News and audio modules **do not import** from `business_modules/resilience/`; only the composition root (or a thin orchestrator) connects them.
4. Output **assessment + signals** remain compatible with existing **report JSON** consumers (web app, chat context builder) unless those are versioned in a follow-up spec.

---

## Migration notes (from current repo)

- Legacy orchestration maps to **`app/resilienceAnalysisService.js`** + **`api/analysisService.js`** (host); canonical code is under `business_modules/resilience/`.
- `loadMdFiles` (markdown → article DTOs) remains a **host-side** concern that **builds `ResilienceContentBatch`** until all callers pass DTOs explicitly.

---

## References

- Component definitions: `business_modules/resilience/domain/resilienceComponents.js`.
- Pipeline overview: `docs/main_docu_files/pipeline.md`, `docs/audio-pipeline.md`.
- Module layout rules: `.cursor/skills/create-business-module/SKILL.md` / `.cursor/rules/module-structure.mdc`.
