# Daily News Resilience Analysis — Pipeline Documentation

**Location:** `docs/main_docu_files/` (canonical main documentation — see [README](./README.md))

> **Canonical code paths:** Resilience logic lives under `business_modules/resilience/` (not `src/resilience/`). Key modules: `domain/services/behaviorSignals.js`, `infrastructure/claudeEvaluator.js`, `infrastructure/reportWriter.js`, `domain/resilienceComponents.js`.

**System:** Population Resilience Monitor
**Framework:** 8-Component Community Resilience (Pikud HaOref / פיקוד העורף)
**Last updated:** 2026-03-22

---

## Overview

Every day, news articles from 7 Israeli news sites are fetched, filtered for home-front relevance, and analyzed for behavioral signals that indicate how the population is coping with the emergency. The result is a structured resilience report scored across 8 components.

The pipeline has three major stages:

```
[News APIs] → articles-homefront.md → [LLM signal extraction] → [Code scoring] → [LLM narrative] → Report
```

A key design principle: **LLM extracts, code scores**. The LLM finds behavioral evidence and classifies it into a fixed signal vocabulary. A deterministic algorithm then maps those signals to component scores — the LLM does not decide the scores. This makes scoring consistent, auditable, and comparable across days.

---

## Stage 1 — Article Fetching and Filtering

### Trigger

Run manually or via the `/analyze-news` slash command:

```bash
npm run homefront-to-md
```

### What it does

**Entry:** `business_modules/news-sites/input/extract-homefront-articles.js` → `app/extractHomefrontArticles.js`

1. **Fetches** today's main-news articles from many Israeli outlets via the NewsAPI.ai API:
   - Each site has an adapter under `business_modules/news-sites/infrastructure/adapters/newsApi*Adapter.js`
   - The date used is today in `Asia/Jerusalem` timezone (configurable via `TZ_ARTICLES` env var)

2. **Filters** with an LLM (Haiku) on title plus a short body snippet for population-behavior relevance (not the legacy keyword-only filter). A multilingual keyword list lives at `business_modules/social_media/domain/services/homefrontKeywords.js` for social ingest and query building.

3. **Deduplicates** cross-site articles — same story published by multiple outlets is counted once (key = first 40 meaningful chars of title)

4. **Writes** a single markdown file: `articles-homefront.md`
   - Each article includes: title, URL, publication date, source, full body text
   - A header summarizes the total and filtered counts

### Output

`articles-homefront.md` — the single source of truth for the analysis. Typical result: ~300–400 articles fetched across all sites, ~50–150 pass the filter.

### Environment variables required

| Variable | Purpose |
|---|---|
| `NEWSAPI_AI_KEY` (or `NEWSAPI_API_KEY`) | NewsAPI.ai authentication |
| `TZ_ARTICLES` | Timezone for "today" (default: `Asia/Jerusalem`) |
| `HOMEFRONT_MD` | Output path (default: `articles-homefront.md`) |

---

## Stage 2 — Behavioral Signal Extraction

### Trigger

```bash
npm run analyze-resilience -- --date YYYY-MM-DD
```

Or via the `/analyze-news` slash command (which runs both stages).

**Script:** `business_modules/resilience/input/analyze-resilience.js` (via `npm run analyze-resilience`)
**Core module:** `business_modules/resilience/infrastructure/claudeEvaluator.js`

---

### Step 2a — Title Pre-filter (Haiku)

Before sending full article bodies to the LLM, a fast Haiku pass classifies article titles to discard ones with no plausible behavioral content.

**Model:** `claude-haiku-4-5-20251001`
**Input:** All article titles (one list)
**Output:** Indices of articles to keep

**INCLUDE criteria:**
- Direct quotes from residents or local officials
- Specific observable actions (sheltering, evacuating, volunteering, closing schools)
- Statistics or counts (compliance rates, attendance figures)
- Institutions operating or failing (hospitals, municipalities)
- Mutual aid, community organizing, solidarity acts
- Mental health services activated or residents seeking support

**EXCLUDE:**
- Military/battlefield reports with no civilian behavior component
- National-level political statements without a described public reaction
- Journalist assessments of "how the community is coping" without concrete evidence

Typical result: ~80–130 articles pass out of 300–400.

---

### Step 2b — Signal Extraction (Haiku)

The pre-filtered articles are sent in batches of 60 to Haiku for behavioral signal extraction.

**Model:** `claude-haiku-4-5-20251001`
**Max tokens per batch:** 12,000
**Batching:** Automatic — articles are split into batches of ≤60

#### Closed Signal Vocabulary

The LLM must classify each piece of behavioral evidence into one of **32 signal types** across 8 domains. It cannot invent new types.

| Domain | Signal Types |
|---|---|
| **Compliance & Discipline** | `compliance_enter_shelter`, `compliance_follow_instructions`, `non_compliance_exit_early`, `non_compliance_ignore_guidelines` |
| **Risk & Safety** | `risk_exposure_behavior`, `panic_behavior`, `unsafe_gathering` |
| **Social Cohesion** | `solidarity_help_others`, `community_volunteering`, `social_isolation`, `conflict_or_tension` |
| **Leadership & Governance** | `leadership_visible_presence`, `leadership_clear_guidance`, `leadership_absence`, `coordination_failure` |
| **Information & Communication** | `information_clarity`, `information_confusion`, `rumor_spread`, `active_information_seeking` |
| **Functional Continuity** | `service_continuity`, `service_disruption`, `routine_maintenance`, `system_overload` |
| **Emotional / Narrative** | `fear_expression`, `calm_confidence`, `resilience_narrative_positive`, `resilience_narrative_negative` |
| **Community Resources** | `resource_mobilization`, `resource_shortage`, `self_organization`, `dependency_on_external_aid` |

#### Signal Schema

Each extracted signal has this structure:

```json
{
  "article_index": 12,
  "article_url": "https://...",
  "signal_type": "service_disruption",
  "evidence": "גן הילדים נסגר ביום ראשון בשל מצב הביטחוני",
  "intensity": 0.8,
  "confidence": 0.9
}
```

| Field | Description |
|---|---|
| `article_index` | Position of the article in the batch |
| `article_url` | Direct link to the source article |
| `signal_type` | One of the 32 fixed signal types |
| `evidence` | Exact quote or bare factual description — no journalist adjectives |
| `intensity` | 0–1: how strong/clear this behavioral signal is |
| `confidence` | 0–1: how confident the LLM is this is genuine behavioral evidence (not journalist characterization) |

#### Extraction Rules (enforced in the prompt)

1. **Atomic** — one signal = one behavioral fact. Compound behaviors are split into separate signals.
2. **Closed vocabulary** — only types from the catalog above are accepted; unknown types are dropped by code.
3. **Evidence required** — only extract if there is a verbatim/near-verbatim quote, a specific observable action, or a statistic. Journalist opinions are rejected.
4. **No journalist framing** — strip characterizations; keep only the bare fact.

Signals with unknown `signal_type` values are silently dropped by the validator in `claudeEvaluator.js`.

---

## Stage 3 — Deterministic Scoring

**Module:** `business_modules/resilience/domain/services/behaviorSignals.js`
**No LLM involved — pure code.**

### Many-to-many mapping

Each signal type maps to one or more resilience components, with a base weight per component. Examples:

| Signal | Component mappings |
|---|---|
| `solidarity_help_others` | `belonging_solidarity` +1.0, `wellbeing_at_risk` +0.7, `community_capital` +0.6 |
| `service_disruption` | `functional_continuity` −1.5, `wellbeing_at_risk` −0.4 |
| `leadership_clear_guidance` | `leadership` +1.1, `information_communication` +0.4 |
| `coordination_failure` | `leadership` −1.0, `community_capital` −0.6, `functional_continuity` −0.5 |
| `fear_expression` | `narrative` −0.8, `wellbeing_at_risk` −0.7 |

The full mapping table is in `business_modules/resilience/domain/services/behaviorSignals.js` → `SIGNAL_TO_COMPONENTS`.

### Scoring formula

For each component:

```
raw_score = Σ (base_weight × intensity × confidence)   for all signals mapped to this component

score (1–10) = sigmoid(raw_score) × 9 + 1
```

The sigmoid function maps any raw score to the 1–10 range:
- `raw = 0` → score ≈ 5.5 (neutral baseline — equal positive and negative evidence)
- Large positive raw → approaches 10
- Large negative raw → approaches 1

### Confidence levels

| Confidence | Condition |
|---|---|
| `insufficient_data` | 0 signals mapped to this component |
| `low` | 1–2 signals |
| `medium` | 3–6 signals |
| `high` | 7+ signals |

### Overall score

Mean of all components that have at least one signal. Components with `insufficient_data` are excluded from the mean.

---

## Stage 4 — Narrative Generation

**Model:** `claude-sonnet-4-6`
**Module:** `business_modules/resilience/infrastructure/claudeEvaluator.js` → `generateNarratives()`

Sonnet receives the pre-computed scores and the signals bucketed by component. Its only job is to **write behavioral narratives** — it does not re-score.

For each component, Sonnet produces:
- `narrative` — 3–5 sentence behavioral description (describes what people are doing/saying, not abstract assessments)
- `manifestations_evidenced` — which of the component's behavioral manifestations have evidence today
- `manifestations_absent` — which manifestations have no evidence today
- `supporting_evidence` — up to 3 evidence quotes supporting the score
- `weakening_evidence` — up to 3 evidence quotes working against the score

At the top level:
- `cross_component_synthesis` — 2-paragraph behavioral summary across all 8 components
- `evidence_quality_note` — 1 sentence on the proportion of direct quotes vs reported facts today

### Behavioral manifestations

Each component has 4–5 specific behavioral manifestations defined in `business_modules/resilience/domain/resilienceComponents.js`. These are the observable signs the framework expects to see, derived from the Home Front Command's assessment methodology.

Example — **Leadership** manifestations:
1. Residents express that formal or informal leadership is a source of support and security
2. Leadership actively encourages residents to follow HFC guidelines (statements, actions, public presence)
3. Leadership is reported to function professionally and manage the situation competently
4. Residents express distrust, criticism, or frustration with leadership

Narratives explicitly note which manifestations are absent — a deliberate design choice to avoid hiding gaps.

---

## Stage 5 — Report Writing

**Module:** `business_modules/resilience/infrastructure/reportWriter.js`

Two files are written to `reports/`:

### Markdown report (`resilience-report-YYYY-MM-DD.md`)

1. **Header table** — date, sources, article count, overall score
2. **Executive summary** — cross-component synthesis (behavioral)
3. **Component score table** — all 8 components with score, status (color), confidence, signal count
4. **Detailed analysis** — per component:
   - Score, confidence, signal count
   - Narrative (behavioral, 3–5 sentences)
   - Positive behavioral signals
   - Negative behavioral signals
   - Behavioral signs with no evidence today
5. **Evidence quality note**
6. **Signal appendix** — every extracted signal grouped by type, each with a direct link to the source article URL

### JSON data file (`resilience-report-YYYY-MM-DD.json`)

Full structured data including:
- Complete assessment object (all scores, narratives, manifestations)
- All extracted signals with URLs, evidence text, intensity, confidence
- Source file list and generation timestamp

---

## The 8 Resilience Components

Based on the Pikud HaOref / Fran Norris 2008 framework:

| ID | Hebrew | English |
|---|---|---|
| `narrative` | נרטיב | Narrative |
| `information_communication` | מידע, תקשורת ושיתוף | Information, Communication & Sharing |
| `lifesaving_behavior` | התנהגות אפקטיבית להצלת חיים | Effective Life-Saving Behavior |
| `functional_continuity` | רציפות תפקודית | Functional Continuity |
| `community_capital` | הון ומשאבי קהילה | Community Capital & Resources |
| `leadership` | מנהיגות | Leadership |
| `belonging_solidarity` | שייכות וסולידריות | Belonging & Solidarity |
| `wellbeing_at_risk` | דאגה לרווחה הפיזית והנפשית | Physical & Mental Wellbeing (At-Risk) |

Full definitions and behavioral manifestations: `business_modules/resilience/domain/resilienceComponents.js`

---

## Running the Full Pipeline

### Via slash command (recommended)

```
/analyze-news
```

This runs both stages automatically and reports the scores.

### Manually

```bash
# Stage 1 — fetch and filter articles
npm run homefront-to-md

# Stages 2–5 — extract signals, score, generate report
npm run analyze-resilience -- --date 2026-03-17
```

### CLI options

```
--files <f1.md,...>    Input file(s), comma-separated (default: articles-homefront.md)
--date  <YYYY-MM-DD>   Report date (default: parsed from file header)
--output <path>        Output path without extension (default: reports/resilience-report-<date>)
```

---

## Cost and Safety Controls

| Control | Value / Behavior |
|---|---|
| **Cost cap** | $3.00 per run. Process terminates with partial usage report if exceeded. |
| **Haiku batch retries** | Up to 3 attempts with 3/6/9s backoff |
| **Sonnet retries** | Up to 3 attempts with 5/10/15s backoff |
| **Partial recovery** | If a Haiku batch hits `max_tokens`, complete JSON objects are salvaged from the truncated output |
| **Unknown signal types** | Dropped with a warning — do not crash or corrupt scores |

### Typical costs per run

| Step | Model | Typical cost |
|---|---|---|
| Pre-filter | Haiku | ~$0.01 |
| Signal extraction (2 batches) | Haiku | ~$0.07–0.10 |
| Narrative generation | Sonnet | ~$0.10–0.15 |
| **Total** | | **~$0.18–0.26** |

---

## File Map

```
business_modules/news-sites/input/
  extract-homefront-articles.js   Stage 1 CLI → extractHomefrontArticles
  fetch-articles-to-md.js         Single-site fetch CLI
  discover-source-uris.js         NewsAPI.ai source URI probe (dev)
  debug-api.js                    Event Registry response debug (dev)

business_modules/audio/input/
  audio-to-md.js                  Transcribe audio → articles-audio.md

business_modules/resilience/input/
  analyze-resilience.js           News/audio-transcript markdown → 8-component report
  analyze-survey.js               Municipality survey Excel → reports

cross-cut-modules/budget/input/
  test-token-usage.js             Token/cost audit vs resilience pipeline (dev)

business_modules/pbo_report_muni/input/
  analyze-event-log.js            PBO pipe-delimited log → event report

business_modules/news-sites/
  app/extractHomefrontArticles.js  Fetch all sites + LLM pre-filter → articles-homefront.md
  app/fetchArticlesToMd.js         Single-site markdown export
  domain/mainNewsFilter.js        Main-news URL filter (used by adapters)
  domain/services/homefrontKeywords.js   Multilingual keywords (social_media module)

business_modules/social_media/data/       OSINT JSON (signals-social-*.json) + markdown reports
  infrastructure/adapters/        newsApiAdapterFactory + per-site NewsAPI.ai adapters

business_modules/resilience/
  domain/resilienceComponents.js  8 component definitions + behavioral manifestations
  domain/services/behaviorSignals.js   Signal taxonomy, mapping table, deterministic scoring
  domain/services/assessmentMethodology.js  Phase-1 methodology metadata on reports
  infrastructure/claudeEvaluator.js      LLM: signal extraction, narrative generation
  infrastructure/reportWriter.js         Write .md and .json output files
  input/assess-signals.js           Stage-2 assess (national + north scope)
  input/analyze-resilience.js       News/audio orchestration (national artifact only)

reports/
  resilience-report-YYYY-MM-DD.md    Daily markdown report (human-readable)
  resilience-report-YYYY-MM-DD.json  Daily JSON data file (machine-readable)

.claude/commands/
  analyze-news.md                 /analyze-news slash command definition

docs/
  docs/main_docu_files/pipeline.md   This file
```

---

## Design Principles

1. **LLM extracts, code scores.** The LLM's job is pattern recognition — find behavioral evidence, classify signal type. Scoring is deterministic and auditable.

2. **Closed vocabulary.** The LLM cannot invent signal types. This ensures consistency across days and makes trends comparable over time.

3. **Behavioral signals only.** The system explicitly rejects journalist characterizations ("the community showed resilience"). It requires concrete evidence: a verbatim quote, a specific action, or a statistic.

4. **Atomic signals.** One signal = one behavioral fact. Compound observations are split so each signal maps cleanly to its components.

5. **Many-to-many mapping.** One signal can affect multiple components. `solidarity_help_others` is simultaneously evidence for Belonging, Wellbeing, and Community Capital — reflecting the real-world complexity of behavior.

6. **Absence is explicit.** The report always lists which behavioral manifestations have no evidence today. This prevents the appearance of completeness when data is thin.

7. **Article links in evidence.** Every signal in the appendix links back to the original article URL, making every claim in the report traceable to its source.
