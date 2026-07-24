# Resilience engine reference

**Purpose:** Implementation reference for the **assessment engine** — extraction, verification, **agent-RAG investigation assess**, shadow deterministic scoring, and display redaction. The product is **decision support**; this document describes machinery that **informs** operators, not replaces them.

**Companion:** [SYSTEM-AND-OPERATOR-MODEL.md](./SYSTEM-AND-OPERATOR-MODEL.md) (what operators see), [docs/MODEL-CARD.md](../MODEL-CARD.md) (policy tables and agent env flags).

**Code roots:** `business_modules/resilience_scorer/`, `business_modules/specialist_agents/`, `cross-cut-modules/agent/`, `cross-cut-modules/retrieval/`, `domain/services/assessmentDisplayTier.js`, `domain/services/scoring/scoreComponentsOrchestrator.js`.

---

## 1. Conceptual and technical shift

Docs and operators should treat the refactor as a change in **what is primary**, not only in implementation detail.

### 1.1 Conceptual (operators and analysts)

| Dimension | Pre-refactor (math-scoring centered) | Post-refactor (agent-RAG decision support) |
|-----------|--------------------------------------|--------------------------------------------|
| **Primary question** | “What is the 1–10 resilience score today?” | “What happened, with what evidence, and what needs attention?” |
| **Unit of truth** | Weighted signal mass → component score | **Claims** with `evidence_refs`, grounded in catalog signals + archive retrieval |
| **LLM role** | One (or few) narrative passes over **already-scored** components | **Planner → parallel specialists → critic → synthesizer** — investigation before synthesis |
| **Archive / RAG** | Secondary (chat, optional extract RAG) | **First-class at assess time** — RAG seed, multi-hop tools, `get_source`, residual/OOV on blackboard |
| **Thin / abstain days** | Low catalog mass → abstain narrative | **Split mass**: thin for **scoring** vs **investigation-eligible** (archive spike, residual, OOV may still warrant specialist) |
| **Novel behavior** | OOV logged; optional low-weight synthetic score | OOV/residual enter **evidence graph + planner** as investigation objects |
| **Operator proof** | Narrative paragraph + instrument flags | **Evidence tree** per claim + cross-component synthesis + instrument flags (from epistemic/shadow) |
| **Analyst calibration** | Scores + drift on disk | Scores as **shadow** score visible in-app + **trace JSONL** replay (the separate drift/divergence calibration tooling has since been retired) |
| **Multi-agent pattern** | N/A (batch narrative) | **Plan-and-execute map–reduce** (not peer agent chat) — see §3.1 |

**Unchanged conceptually:** closed-catalog extraction for comparability; humans decide; abstention and data void as features; operator tier hides headline scores.

### 1.2 Technical (code and artifacts)

| Layer | Pre-refactor | Post-refactor (default) |
|-------|--------------|-------------------------|
| **Assess entry** | `assess-signals` → `runScoringPipeline` → legacy Sonnet narratives | `assess-signals` → `produceAssessmentWithShadow` → **`runAssessmentAgent`** (or deterministic degrade) |
| **Primary module** | Legacy `claudeNarratives.js` (removed) | `business_modules/specialist_agents/` + `cross-cut-modules/agent/` + retrieval helpers |
| **Orchestration** | Linear: score then narrate | Planner → `Promise.all` specialists → critic → optional re-plan → synthesizer |
| **Epistemic input** | Scored components only | `computeEpistemicProfile` + **`enrichProfileForInvestigation`** |
| **Evidence assembly** | Signals in narrative prompt | **`buildEvidenceGraph`** (signals + RAG hits + OOV/residual + gaps) |
| **Output schema** | Legacy `assessment.components[].narrative` | **Assessment v2** → **`mapAssessmentV2ToLegacy`** (`assessmentV2Mapper.js`) for API compatibility |
| **Shadow path** | Scores were primary | **`scoreComponents` still runs** every assess (`scoringFacade.js` → `analyst/`) to produce the headline score kept on the report; the per-report `shadow-scores-*.json` / `divergence-*.json` artifact write has been retired |
| **Trace / audit** | Cost log only | **`assessment-agent-trace-{id}.jsonl`** |
| **Degrade ladder** | — | Agent skip/failure → `runDeterministicAssessment` → `loadCachedAssessmentFallback`; `assessment_degraded` on report |

---

## 2. Purpose — investigate, then inform (not oracle)

The engine:

1. Extracts **observable behavioral signals** (closed vocabulary) from multi-source text via LLM.
2. Verifies evidence spans and assigns **grounding tiers**.
3. Runs **shadow deterministic scoring** in code (calibration / divergence — not the primary operator narrative path).
4. Runs **assessment agent v2** (default): RAG-seeded evidence graph → planner → specialists → critic → synthesizer.
5. **Redacts** numeric headline scores at API/UI for the default operator tier.

Shadow scores on disk under `daily_reports/` remain visible to analysts in the report UI for calibration; the separate drift-dashboard and divergence-review tooling that used to consume them has been retired. **Operational action** should follow attention, **evidence-backed claims**, and instrument flags — see [SYSTEM-AND-OPERATOR-MODEL.md](./SYSTEM-AND-OPERATOR-MODEL.md).

---

## 3. End-to-end pipeline

```text
Markdown / archive rows
  → extract-signals.js (Claude, closed tags)
  → signal JSON bundles
  → assess-signals.js
       ├─ scope + epistemic partition (regionSignalFilter, metrics eligibility)
       ├─ prepareScoringSignals (quarantine, data void, OOV)
       ├─ verify / grounding (claudeEvidenceVerification, groundingPolicy)
       ├─ scoreComponents (deterministic) — SHADOW / calibration
       ├─ thin-evidence + salience post-policy (highSalienceBypass)
       ├─ epistemic gate + EWMA (scoringPipelinePrep)
       ├─ produceAssessmentWithShadow
       │    ├─ computeEpistemicProfile (epistemicFeaturesService)
       │    └─ runAssessmentAgent (or runDeterministicAssessment on degrade)
       │         ├─ enrichProfileForInvestigation
       │         ├─ RAG seed (seedComponentRagHits) + buildEvidenceGraph (+ residual/OOV)
       │         └─ planner → specialists → critic → optional re-plan → synthesizer
       ├─ mapAssessmentV2ToLegacy → write report JSON/MD
       └─ redactReportPayload at API boundary (assessmentDisplayTier)
```

**Degrade:** `produceAssessmentWithShadow` skips the agent when `shouldSkipAssessmentAgent` fires (`RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC=1` or daily assess budget exceeded via `dailyBudgetExceeded`). `RESILIENCE_ASSESSMENT_AGENT=0` is deprecated (same effect, logs warning). Legacy Sonnet narratives removed.

**`degrade_reason` values on report:** `budget_exceeded`, `forced_deterministic`, `agent_failed`, `empty_scores` (cached fallback). Distinct from **HTTP crisis chat pool** (`crisisBudgetService`) — assess agent uses pipeline daily budget, not the chat crisis pool.

Production entries: single assess stage `input/assess-signals.js` → `app/assessSignalsCli.js`; full ingest+assess `input/run-pipeline.js` → `app/pipelineOrchestrator.js` (see [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)). The legacy batch helper `app/runResilienceAnalysis.js` (never wired into the daily pipeline) was removed.

### 3.1 Assessment agent (v2)

**Entry:** `business_modules/resilience_scorer/app/assessment/produceAssessmentWithShadow.js` → `business_modules/specialist_agents/app/assessmentOrchestrator.js`

**Pattern:** plan-and-execute **map–reduce** (parallel specialists per component; not peer-to-peer agent chat).

| Stage | Module | Role |
|-------|--------|------|
| Prep | `cross-cut-modules/retrieval/componentRagSeeding.js`, `evidenceGraph.js` | Hybrid retrieve seeds + signal/residual/OOV claims |
| Planner context | `cross-cut-modules/retrieval/plannerContextBuilder.js` | Gaps, media/archive anomalies, OOV/residual summary |
| Planner | `business_modules/specialist_agents/app/plannerAgent.js` | Investigation plan (deterministic or Haiku); `planner_source` metadata |
| Specialists | `business_modules/specialist_agents/app/componentSpecialistAgent.js` | Per-component tool loop (tiers A/B/C); multi-hop RAG + `lookup_signals` / `get_source` |
| Critic | `business_modules/specialist_agents/app/criticAgent.js` | Deterministic grounding / thin-evidence / gap checks |
| Re-plan (optional) | orchestrator + `replanPolicy.js` | Single hop when cross-component issues or gap overload |
| Synthesizer | `business_modules/specialist_agents/app/synthesizerAgent.js` | Cross-component narrative (conditional Sonnet or deterministic) |

**Kernel:** `cross-cut-modules/agent/agentKernel.js` — shared tool loop, budget governor, trace JSONL.

**Outputs on report:** `agent_trace_id`, `investigation_plan`, `planner_context`, `budget_snapshot`, `cross_component_issues`, `evidence_graph_summary`; per-component `evidence_tree` (operators) and `specialist_tier` (v2 / trace).


**Evidence graph** (`cross-cut-modules/retrieval/evidenceGraph.js` → `buildEvidenceGraph`):

| Node kind | Source |
|-----------|--------|
| `chunks` | Hybrid RAG hits (text, `source_type`, `seed_origin`) |
| `signals` | Closed-catalog signal refs from registry |
| `sources` | Parent archive rows linked from chunks |
| `oov_clusters` | OOV burst clusters (optional; `RESILIENCE_ASSESS_OOV_GRAPH`, default on) |
| `residual` | Residual observations mapped to components |

Edges link sources → chunks → signals. `by_component` holds hypothesis claims with `claim_id`, `support` / `contradict` refs.

**OOV injection:** When `oovGraphEnabled()`, clusters enter the graph when count ≥ 3 or residual+burst combos fire; lowered threshold when data void is elevated/critical.

**Gap classification:** `buildRetrievalGaps` + `classifyGap` → `gap_type` `data` | `investigation`; `buildClassifiedGapsForPlanner` feeds the planner.

**Specialist tools:** `assessmentEvidenceTools.js`, `multiHopRetrieval.js` — `lookup_signals`, `get_source`, multi-hop retrieve within the agent tool loop.

**Eval:** `npm run agent:eval`. **Trace replay:** `GET /api/report/agent-trace/:traceId` (analyst). Feature flags: [MODEL-CARD.md § Assessment agent](../MODEL-CARD.md#assessment-agent-v2-option-b).

### 3.2 Epistemic profile for investigation

**Builder:** `business_modules/resilience_scorer/domain/epistemic/epistemicProfileBuilder.js`  
**Investigation enrich:** `investigationEpistemic.js` — adds `investigation_mass`, `investigation_eligible`, `archive_mention_mass`, `residual_observation_count`, `presence_gate_triggered`, `salience_critical` (from shadow scored components).

Per-component `by_component` fields include `signal_count` and `distinct_article_count` (Jun 2026) — fed into `deriveInstrumentState` via `assessmentV2Mapper`, not headline scores.

**`retrieval_policies` output:** `buildRetrievalPolicies(byComponent)` emits `{ diversify, boost, require_corroboration }` on the persisted profile. Consumed by `cross-cut-modules/retrieval/retrievalPolicies.js` during assess RAG diversify. `dominance_warnings` on the profile become diversify policies and planner gaps.

**Persisted artifact:** `daily_reports/epistemic-profile-{scopeId}-{date}.json` via `epistemicService.persistProfile`.

When `RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS=1` (default), planner abstention uses **investigation eligibility**, not catalog mass alone — a component may be thin for **scoring** but still investigated when archive/residual/OOV warrants it.

### 3.3 Legacy compatibility layer

**Mapper:** `business_modules/specialist_agents/domain/services/assessmentV2Mapper.js` → `mapAssessmentV2ToLegacy(v2, epistemicProfile, opts)`.

| v2 field | Legacy mapping |
|----------|----------------|
| `claims[]` with `evidence_refs` | `narrative_claims` + `evidence_tree` (fallback `evidenceTreeFromGraph`) |
| `severity`, `confidence`, `operator_status` | Per-component legacy fields |
| Epistemic `signal_count`, `distinct_article_count` | `deriveInstrumentState` inputs |
| `overall_resilience_score` | Always `null` on legacy object |

`produceAssessmentWithShadow` returns the **legacy-mapped** assessment for API/write; v2 fields are attached via `attachAssessmentV2Fields`. On-disk JSON includes both shapes. (The earlier in-memory `shadow_divergence` field and the on-disk `divergence-*.json` shadow-vs-agent comparison have been retired along with the analyst drift/divergence UI that consumed them.)

---

## 4. Epistemic tiers and abstention

**Grounding tiers** (`groundingPolicy.js`):

| Tier | Mass in scoring | Operator meaning |
|------|-----------------|------------------|
| `grounded` | Full weight | Verified evidence |
| `weak` | Scaled (`RESILIENCE_GROUNDING_WEAK_WEIGHT`, default 0.35) | Weak verification |
| `unverified_critical` | **Zero** | Critical-type signal failed verification — alert only |
| `rejected` | Zero | Dropped from scoring |

**Geo / provenance epistemic partition** (when `RESILIENCE_EPISTEMIC_GEO_V2` enabled — disable with `=0` for legacy):

| Provenance | Component metrics | Narrative |
|------------|-------------------|-----------|
| `verified_geo` | Yes | Yes |
| `source_assigned` (field/PBO/WhatsApp) | Yes | Yes |
| `macro_national` | No (context) | Information environment |
| Metrics-unsafe geo | No | Context only |
| `insufficient_data` | Abstain | Abstain |

**Source channel taxonomy** (`domain/services/dataVoid/sourceChannels.js`):

| Set | Types | Role |
|-----|-------|------|
| `DIGITAL_SOURCE_TYPES` | `news`, `radio`, `whatsapp`, `telegram`, `social`, `x` | Digital volume for sampling |
| `FIELD_SOURCE_TYPES` | `field`, `field_whatsapp`, `pbo`, `pbo_regional`, `naftali` | Field / official structured anchors |
| `PROBE_SOURCE_TYPES` | `infrastructure_probe` | High-trust probes (not digital volume) |
| `CAP_EXEMPT_SOURCE_TYPES` | `infrastructure_probe`, `pbo`, `pbo_regional`, `naftali`, `field` | Exempt from 50% source-type cap (official ground truth); `field_whatsapp` remains capped |

Module facade `business_modules/resilience_scorer/domain/services/signalCatalog.js` re-exports `cross-cut-modules/resilience-contracts/signalCatalog.js` — edit the contract file only.


**Data void / digital darkness** (`business_modules/resilience_scorer/domain/services/dataVoid/`):

- Elevated void level → **abstention**: null component scores, `assessment_mode: abstained`, operator instrument `sampling_blind`.
- `digital_darkness` → **field-anchor-only** re-score using field-family sources; stale digital-inclusive snapshot preserved separately.

Abstention is a **feature** — prompts operators to ingest field sources or wait.

---

## 5. Operator instruments (before score math)

Thin-evidence policy (`thinEvidencePolicy.js`, Option C):

When `evidence_mass < 1.5` (typical floor):

| Condition | Operator instrument | Shows 1–10? |
|-----------|---------------------|-------------|
| Zero signals | `insufficient_data` | No |
| Thin, score in [3,8] | `limited_evidence_neutral` | No |
| Thin, score outside [3,8] | `unverified_alert` | No |
| Salience-critical bypass | `critical_single_signal` | **Yes** (exception) |
| Data void / sampling blind | `sampling_blind` | No |
| Adequate mass | `adequate` | Per policy |

**High-salience bypass** (`highSalienceBypass.js`, `RESILIENCE_HIGH_SALIENCE_BYPASS=0` disables):

- One dominant contributor (≥85% mass), critical signal type or severe event, plus credibility booster → may skip **low** floor clamp only (asymmetric — does not bypass high hype cap).
- Tier-C unverified critical → operator alert without floor bypass.

**Contested evidence:** `derivePolarizationBand` — `contested` when polarization > 0.5 and mass > 4; UI contested badge.

**Display derivation:** `deriveInstrumentState` in `assessmentDisplayTier.js` builds the `instrument` object operators see.

---

## 6. Analyst tier and on-disk truth

- **Operator API/UI:** `redactReportPayload` / `redactAssessmentForView` strip headline scores and debug narrative fields.
- **Analyst view:** same `client/` app, `?view=analyst`; score-revealing components shown inline in `ReportView.jsx`. The separate `analyst-site/` SPA (drift, validation review, catalog proposals, agent trace replay) has been retired.
- **Full JSON:** `daily_reports/resilience-report-*.json` retains shadow scores, v2 agent fields, and legacy-mapped narratives.
- **Agent trace:** `daily_reports/assessment-agent-trace-{traceId}.jsonl` — planner, specialist, critic, synthesizer steps.
- **Per-run token rollup:** `cross-cut-modules/budget/resilience_analysis/token-report-{date}-{scope}.json` — written by `run-pipeline.js` (`writeTokenReport.js`); see [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md).

The per-report `shadow-scores-*.json` / `divergence-*.json` artifact write (`RESILIENCE_SHADOW_SCORING`) and the drift APIs that read them have been retired along with the analyst calibration UI. Shadow scoring (the deterministic headline score) and agent assess still share the same signal prep; **presentation** differs by tier. Primary operator proof is **claims + evidence_refs**, not headline scores.

---

## 7. Stage reference (concise)

### Signal catalog v6

**File:** `cross-cut-modules/resilience-contracts/signalCatalog.js` — `CATALOG_VERSION = 'v6'`, stamped on assessments and extraction cache keys.

**Size:** ~165 closed signal types (`SIGNAL_TYPES.length >= 165`).

**v6 additions** (regression list in `tests/business_modules/resilience_scorer/domain/services/signalCatalog.v5.test.js`):

- `self_evacuation_unauthorized`
- `early_warning_system_failure`
- `early_warning_system_effective`
- `population_survey_finding`
- `connectivity_outage`
- `institutional_abandonment_perception`

Module facade re-exports from `business_modules/resilience_scorer/domain/services/signalCatalog.js` and `business_modules/resilience_scorer/index.js` — edit the contract file only.

### 7.1 Extraction

- **CLI:** `extract-signals.js`
- **Infrastructure:** `claudeExtraction.js`, closed vocabulary from `behaviorSignals.js` / catalog
- **Catalog:** `cross-cut-modules/resilience-contracts/signalCatalog.js` — `SIGNAL_TYPES`, `CATALOG_VERSION` (v6) stamped on assessments
- **OOV capture:** `business_modules/resilience_scorer/domain/services/oovCapture.js` → `daily_reports/oov-capture-{date}.jsonl` when `RESILIENCE_OOV_CAPTURE=1`
- **Output:** `signals-{source}-{date}.json`
- **Side effects:** `source_archive` rows, optional RAG index at ingest
- **PBO review metadata:** Municipal extract (`extract-pbo-signals.js`) merges officer supplemental answers via `loadReviewMetadataMapForDate` from `pbo_report_review`; `shouldForcePboSignalRewrite` forces re-extract when inbound replies arrive. Review state flows into PBO signals before assess. See [PIPELINE § Municipal PBO review](./PIPELINE-AND-SOURCES.md#municipal-pbo-review).

### 7.2 Verification and grounding

- **Infrastructure:** `signalVerification.js`, `claudeEvidenceVerification.js`, `sourceNativeGrounding.js`
- Sets `grounding_tier`, verification metadata on each signal
- Critical types list shared with salience bypass (`CRITICAL_BYPASS_SIGNAL_TYPES`)

### 7.3 Shadow scoring (calibration)

- **Orchestrator:** `scoreComponentsOrchestrator.js` (`scoreComponents`, v5 model — `SCORING_MODEL_VERSION` in `assessmentMethodology.js`)
- **When:** Always runs in `assess-signals.js` via `runScoringPipeline` **before** `produceAssessmentWithShadow` (feeds epistemic profile and instruments)
- **Steps per component:** weighted items → source cap → raw score → salience post-policy → bootstrap CI, counterfactuals, presence gates, facets
- **Shared math:** `scoring/scoringShared.js` (weights, caps, grounding multiplier)
- **Pipeline wrapper:** `scoringPipelinePrep.js` — digital quarantine partition, EWMA, epistemic gate
- **Dedup / merge:** `app/assessSignalsHelpers.js` (`crossSourceDedupClustered`, `crossSourceDedup`, …)
- **Output:** Feeds epistemic profile + investigation enrich; kept on the report JSON as the redacted headline score. (The separate per-report `shadow-scores-*.json` artifact write and analyst divergence comparison have been retired.)

### 7.4 Deterministic degrade (replaces legacy narratives)

- **Modules:** `runDeterministicAssessment.js`, `loadCachedAssessmentFallback.js`
- **When:** Agent skip/failure, `RESILIENCE_ASSESSMENT_FORCE_DETERMINISTIC=1`, daily budget exceeded, or deprecated `RESILIENCE_ASSESSMENT_AGENT=0`
- Evidence graph + epistemic instruments only (no Sonnet narratives); cached prior report if scores empty
- Report metadata: `assessment_degraded`, `synthesis_mode: deterministic`

### 7.5 Assessment agent (default)

- **Entry:** `produceAssessmentWithShadow.js` → `runAssessmentAgent` in `assessmentOrchestrator.js`
- **Prep:** RAG seed (`componentRagSeeding.js`), evidence graph (`evidenceGraph.js`), planner context
- **Agents:** `plannerAgent.js`, `componentSpecialistAgent.js`, `criticAgent.js`, `synthesizerAgent.js`
- **Policies:** `plannerPolicy.js`, `specialistTier.js`, `synthesisPolicy.js`, Tier 2 (`replanPolicy.js`, `crossComponentConsistency.js`, `contestedRetrievalPolicy.js`)
- **Output:** Assessment v2 → `assessmentV2Mapper.js` (`mapAssessmentV2ToLegacy`) for API; trace JSONL on disk

### 7.6 Reports and display redaction

- Report write from `assess-signals.js` finalize step
- Display redaction at serve time: `assessmentDisplayTier.js`

The analyst-facing extraction-quality validation workflow (`business_modules/resilience_scorer/analyst/validation/`, `GET /api/validation/review-queue`, `ValidationReviewPanel`, `npm run validation:status`) has been retired. `business_modules/resilience_scorer/validation/validation-config.json` and its SQLite/JSONL review-queue artifacts remain on disk from before the removal but are no longer read or written by any code path.

---

## 8. Eight components (conceptual)

The framework follows Pikud HaOref / community resilience (Norris 2008). Component **definitions** and UI labels are code-derived — see Appendix below.

Component ids used in scoring: `narrative`, `information_communication`, `lifesaving_behavior`, `functional_continuity`, `community_capital`, `leadership`, `belonging_solidarity`, `wellbeing_at_risk`.

---

## 9. Key modules

| Area | Path |
|------|------|
| Assess + shadow | `business_modules/resilience_scorer/app/assessment/produceAssessmentWithShadow.js` |
| Assessment agent | `business_modules/specialist_agents/app/` — orchestrator, planner, specialists, critic, synthesizer |
| Shadow/divergence eval (offline, agent quality) | `business_modules/specialist_agents/infrastructure/adapters/shadowArtifactsFileAdapter.js` (`writeShadowArtifacts`), `domain/services/shadowArtifacts.js` (`computeDivergence`) — used by `db/input/agentEval.js`; unrelated to the retired per-report shadow/divergence artifacts |
| Agent kernel / config | `cross-cut-modules/agent/` — `agentKernel.js`, `agentConfig.js` |
| RAG at assess | `cross-cut-modules/retrieval/` — `componentRagSeeding.js`, `evidenceGraph.js`, `plannerContextBuilder.js`, `multiHopRetrieval.js` |
| Epistemic profile | `business_modules/resilience_scorer/domain/epistemic/epistemicProfileBuilder.js`, `investigationEpistemic.js` |
| Synthesis OOV guard | `business_modules/specialist_agents/domain/services/synthesisOovChecks.js` |
| Component definitions | `business_modules/resilience_scorer/domain/resilienceComponents.js` |
| Facets / signal routing | `business_modules/resilience_scorer/domain/services/componentFacets.js` |
| Scope filter | `business_modules/resilience_scorer/domain/services/regionSignalFilter.js` |
| Assess CLI | `input/assess-signals.js` (transport) → `app/assessSignalsCli.js`, `app/assessSignalsHelpers.js` |
| Report cache | `app/reportCacheService.js` — `getCachedReport`, scope-aware paths for `GET /api/report/today` |
| Shadow scoring pipeline | `business_modules/resilience_scorer/app/scoringPipelinePrep.js`, `prepareScoringSignals.js`, `scoreComponentsOrchestrator.js` |
| Display redaction | `business_modules/resilience_scorer/domain/services/assessmentDisplayTier.js` |
| Thin evidence | `business_modules/resilience_scorer/domain/services/thinEvidencePolicy.js` |
| Operator action compass | `business_modules/resilience_scorer/domain/services/actionCompass.js` |
| Anomaly strip | `business_modules/resilience_scorer/domain/services/anomalyStrip.js` |
| Deterministic degrade | `business_modules/specialist_agents/app/runDeterministicAssessment.js`, `loadCachedAssessmentFallback.js` |

---

## Appendix — Code-derived catalog

The sections below are **auto-synced** from code. Do not edit between markers; run `npm run docs:sync`.

### Components at a glance

<!-- docs-sync:BEGIN components-at-a-glance -->

> **Auto-synced** from `business_modules/resilience_scorer/domain/resilienceComponents.js` on 2026-07-24. Do not edit between sync markers.

| # | ID | English | Hebrew | What it measures (in one line) |
|---|---|---|---|---|
| 1 | `narrative` | Narrative | נרטיב | The ability of the public story surrounding the crisis to influence coping. |
| 2 | `information_communication` | Information, Communication, and Sharing | מידע, תקשורת ושיתוף | The ability of information and public messaging to guide life-saving behavior, and to be clear, credible, available, and accessible to all population segments. |
| 3 | `lifesaving_behavior` | Effective Life-Saving Behavior | התנהגות אפקטיבית להצלת חיים | The ability to prepare community mechanisms in routine times and activate them during emergencies to ensure effective life-saving behavior. |
| 4 | `functional_continuity` | Functional Continuity | רציפות תפקודית | The ability of the community to continue functioning and providing essential personal and community services and needs according to the situation's characteristics. |
| 5 | `community_capital` | Community Capital and Resources | הון ומשאבי קהילה | The ability to maximize community resources — human, physical, and social networks — through coordination between community mechanisms, cross-sector cooperation, activation of anchor organizations (local authority, community organizations), and volunteer mobilization. |
| 6 | `leadership` | Leadership | מנהיגות | The perceived ability of formal and informal leadership — including religious figures, spiritual leaders, and community influencers — to lead the community, address its needs, and serve as a source of support and empowerment. |
| 7 | `belonging_solidarity` | Belonging and Solidarity | שייכות וסולידריות | The ability to create a sense of belonging and mutual guarantee among community members. |
| 8 | `wellbeing_at_risk` | Physical and Mental Wellbeing (At-Risk Populations) | דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון | The ability of the community to identify and address the needs of vulnerable populations — in routine times and during emergencies. |

<!-- docs-sync:END components-at-a-glance -->

### Facet decomposition

<!-- docs-sync:BEGIN component-facets -->

> **Auto-synced** from `min-math (componentFacets.js removed)` on 2026-07-24. Do not edit between sync markers.

**Sub-facets retired.** Per-component assessment is count-based `evidence_basis`
(sufficiency / balance / concentration) plus critical flags and narrative — not
facet-level tanh scores. Signal → component edges live in
`domain/services/signals/routing/signalRouting.js` (`SIGNAL_TO_COMPONENTS`).

<!-- docs-sync:END component-facets -->

### Per-component detail

<!-- docs-sync:BEGIN components-detail -->

> **Auto-synced** from `resilienceComponents.js` on 2026-07-24. Do not edit between sync markers.


Per-component reference below is regenerated from code. Extended narrative, signal-routing notes, and boundary rules in earlier manual sections may appear in pipeline stages §3+.

Signal types that route into each component are defined in `SIGNAL_TO_COMPONENTS` (see `signalRouting.js`); this sync block does not duplicate that map.

### 2.2 `narrative` — Narrative (נרטיב)

**What it measures:** The ability of the public story surrounding the crisis to influence coping. A dominant narrative can strengthen or weaken the community's ability to endure. The official narrative must be perceived as credible and relevant. Multiple narratives may coexist — complementary or conflicting. Examples of competing frames: "there is a purpose to the war" vs. "victory is not worth the price."

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent is there a dominant narrative of successful coping?
- To what extent is the official narrative perceived as credible and relevant by the population?
- To what extent are there contradictory or competing narratives undermining the shared story?

**Behavioral manifestations (from code):**
- A narrative of successful coping is visible and circulating (residents/officials describe coping as effective)
- The coping story reflects the entire population, not just a subset
- Residents express that the authority's narrative is credible and reflects their lived reality
- Competing or contradictory narratives are explicitly voiced by residents or groups

---

### 2.3 `information_communication` — Information, Communication, and Sharing (מידע, תקשורת ושיתוף)

**What it measures:** The ability of information and public messaging to guide life-saving behavior, and to be clear, credible, available, and accessible to all population segments. Includes adapted messaging for different sectors and feedback mechanisms. When information is unavailable or not credible, rumors and misinformation fill the vacuum. The goal is to channel the population toward effective life-saving behavior.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent does the population perceive official information — guidance, instructions, and support — as effective and meeting their needs?
- To what extent do information and messaging mechanisms adapted to different community sectors exist?
- To what extent do information gaps remain, or is misinformation (fake news) being spread?
- To what extent is information accessible and available to all population segments, including vulnerable groups?
- To what extent does the guidance match the actual situation people face — is it actionable given real constraints (workers who cannot stop, shelters not accessible, no legal framework to comply), and does it cover edge cases (mass casualties, no nearby shelter, economic decisions under fire)?

**Behavioral manifestations (from code):**
- Residents state they receive the information they need to function during the emergency
- Authority communication mechanisms are adapted to different resident groups (language, channel, format)
- Residents express trust in information received from the authority
- Population perceives national media information as relevant and addressing their needs
- Residents report information gaps, confusion, or spread of rumors/misinformation
- Guidance is reported as situation-matched and actionable — residents could follow it given real-world constraints
- Guidance is reported as mismatched, impractical, or failing to cover critical scenarios (workers with no legal protection to stop, no shelter access, mass-casualty situations)

---

### 2.4 `lifesaving_behavior` — Effective Life-Saving Behavior (התנהגות אפקטיבית להצלת חיים)

**What it measures:** The ability to prepare community mechanisms in routine times and activate them during emergencies to ensure effective life-saving behavior. Includes embedding threat awareness, building knowledge and skills, formal and community enforcement of protective guidelines, and planning and activating personal, family, and community action plans. Also includes embedding a culture of personal and community preparedness.

**Key elements:**
- Threat perception — the population perceives the event as genuinely life-threatening
- Clarity of guidelines — instructions are clear and understood
- Population knowledge and skills — ability to act correctly at both individual and community levels
- Formal and community enforcement of protective guidelines
- Perception of leadership as a professional authority worthy of compliance

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent does the population act according to life-saving guidelines?
- To what extent does the population perceive the event as life-threatening?
- To what extent does the population know and understand the published guidelines?
- To what extent does formal or community enforcement of protective guidelines take place?
- To what extent is leadership perceived as a professional authority that guides protective behavior?

**Behavioral manifestations (from code):**
- Residents are observed or reported to actually follow Home Front Command (HFC) protective guidelines (sheltering, evacuating, etc.)
- Residents demonstrate knowledge and understanding of HFC guidelines
- Community teams or roles actively promote emergency preparedness among residents
- Residents or officials report non-compliance with protective guidelines
- Residents express or demonstrate perception of the situation as genuinely life-threatening

---

### 2.5 `functional_continuity` — Functional Continuity (רציפות תפקודית)

**What it measures:** The ability of the community to continue functioning and providing essential personal and community services and needs according to the situation's characteristics. Includes supply of essential goods and services, operation of essential workplaces and educational institutions, and minimization of damage to daily routine. The aspiration is to restore or preserve continuity as much as possible.

**Principle:** In a disaster, three forms of continuity must be preserved or restored: functional continuity (roles and tasks), identity continuity (sense of self and role), and interpersonal continuity (relationships and social bonds). Maintaining continuity strengthens a sense of competence and reduces dependency. The guiding principle is: "help them help themselves." Examples: a citizen who continues working during an emergency; maintaining family roles after evacuation.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent was daily routine disrupted in the following areas: work, studies, commerce, leisure activities?
- To what extent are essential services and goods available to the population?
- To what extent are essential workplaces and educational institutions continuing to operate?
- To what extent are people able to maintain their functional, identity, and social roles under emergency conditions?

**Behavioral manifestations (from code):**
- Residents succeed in managing daily life (reported continuation of work, commerce, or social roles)
- Schools and educational institutions are open and operating (or explicitly closed/disrupted)
- Residents report that sufficient resources are available to maintain routine functioning
- Essential services (healthcare, supply chains, municipal services) continue to operate
- Specific disruptions to daily life are reported (closures, evacuations, inability to work)

---

### 2.6 `community_capital` — Community Capital and Resources (הון ומשאבי קהילה)

**What it measures:** The ability to maximize community resources — human, physical, and social networks — through coordination between community mechanisms, cross-sector cooperation, activation of anchor organizations (local authority, community organizations), and volunteer mobilization. Optimal use of the comparative advantages of each partner.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent do mechanisms exist for effective coordination and maximization of community resources (human, physical, network)?
- To what extent is there willingness among the population for active volunteer action for their community?
- To what extent are anchor organizations (local authority, community bodies) effectively activated and coordinating?
- To what extent is cross-sector cooperation taking place to address community needs?

**Behavioral manifestations (from code):**
- Residents volunteer or express willingness to volunteer in formal or informal frameworks
- Authority or organizations are observed to activate and coordinate community resources
- Mechanisms exist and operate to coordinate volunteers and community organizations
- Cross-sector cooperation (e.g., municipality + NGOs + businesses) is reported or observed

---

### 2.7 `leadership` — Leadership (מנהיגות)

**What it measures:** The perceived ability of formal and informal leadership — including religious figures, spiritual leaders, and community influencers — to lead the community, address its needs, and serve as a source of support and empowerment. Leadership can strengthen or weaken resilience. Key attributes include public trust, personal example, channeling public perceptions and behavior, and representing all segments of the community.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent is local leadership perceived as a source of support for the population?
- To what extent does leadership set a personal example for the public?
- To what extent does local leadership enjoy public trust and provide a sense of security in managing the event?
- To what extent does leadership represent and address the needs of all community segments, including marginalized groups?

**Behavioral manifestations (from code):**
- Residents express that formal or informal leadership is a source of support and security
- Leadership actively encourages residents to follow HFC guidelines (statements, actions, public presence)
- Leadership is reported to function professionally and manage the situation competently
- Residents express distrust, criticism, or frustration with leadership

---

### 2.8 `belonging_solidarity` — Belonging and Solidarity (שייכות וסולידריות)

**What it measures:** The ability to create a sense of belonging and mutual guarantee among community members. Includes fostering a sense of "shared fate," building and activating programs that strengthen residents' sense of belonging, encouraging mutual aid, and providing responses to groups perceived as outside the community mainstream.

**Principle:** "We are all in the same boat" — a collective sense of shared destiny and mutual responsibility.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent does a sense of solidarity, shared fate, and mutual guarantee exist among the public?
- To what extent do phenomena of mutual aid at the community level exist?
- To what extent are there population groups perceived as "outside the camp" or being scapegoated or blamed?
- To what extent are programs in place to strengthen belonging and address marginalized or vulnerable groups?

**Behavioral manifestations (from code):**
- Residents express a sense of solidarity or shared fate (in their own words)
- Concrete acts of mutual aid between residents are reported (helping neighbors, sharing resources, organizing support)
- Population groups are reported as scapegoated, blamed, or excluded due to the emergency (negative signal)
- Programs or events strengthening belonging are activated and attended

---

### 2.9 `wellbeing_at_risk` — Physical and Mental Wellbeing (At-Risk Populations) (דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון)

**What it measures:** The ability of the community to identify and address the needs of vulnerable populations — in routine times and during emergencies. Includes mapping population vulnerability, establishing mechanisms for identifying needs and providing adapted responses: physical, emotional, and informational.

**Principle:** The chain is only as strong as its weakest link. Responses must be tailored to the specific characteristics of vulnerable and at-risk populations.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent is activity taking place to identify the needs of vulnerable populations (first, second, and third circles of vulnerability)?
- To what extent do sufficient and adapted responses exist for population needs — with emphasis on at-risk populations — at the authority level (physical, emotional, informational)?
- To what extent are mechanisms in place to locate, map, and continuously monitor at-risk individuals and groups?

**Behavioral manifestations (from code):**
- Emotional support responses (psychological first aid, mental health services) are available and used by residents showing anxiety or trauma
- Specific responses for at-risk or special-needs populations are reported as active (elderly, disabled, evacuees, etc.)
- Residents in the second or third circle of vulnerability (indirectly affected) receive responses to their needs
- Reports of unmet mental health or physical wellbeing needs among residents

---

<!-- docs-sync:END components-detail -->

### UI labels (en / he)

<!-- docs-sync:BEGIN appendix-ui-labels -->

> **Auto-synced** from `client/src/i18n/translations.js (en + he)` on 2026-07-24. Do not edit between sync markers.

| ID | English UI label | Hebrew UI label |
|---|---|---|
| `narrative` | Narrative | נרטיב |
| `information_communication` | Information, Communication, and Sharing | מידע, תקשורת ושיתוף |
| `lifesaving_behavior` | Effective Life-Saving Behavior | התנהגות אפקטיבית להצלת חיים |
| `functional_continuity` | Functional Continuity | רציפות תפקודית |
| `community_capital` | Community Capital and Resources | הון ומשאבי קהילה |
| `leadership` | Leadership | מנהיגות |
| `belonging_solidarity` | Belonging and Solidarity | שייכות וסולידריות |
| `wellbeing_at_risk` | Physical and Mental Wellbeing (At-Risk Populations) | דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון |

<!-- docs-sync:END appendix-ui-labels -->
