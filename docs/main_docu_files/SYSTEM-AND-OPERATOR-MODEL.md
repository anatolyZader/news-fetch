# System and operator model

**Purpose:** Describe how the running product supports **human decision-making** — not automated verdicts. Operators scan attention and **evidence-backed claims**; analysts calibrate shadow scoring and review agent traces.

**Sources:** `business_modules/resilience_scorer/domain/services/assessmentDisplayTier.js`, `thinEvidencePolicy.js`, `actionCompass.js`, `anomalyStrip.js`, `app/reportCacheService.js`, `business_modules/specialist_agents/`, `client/src/MainApp.jsx`, `client/src/components/ReportView.jsx`, `analyst-site/src/AnalystApp.jsx`, `cross-cut-modules/messaging/app/registerModuleHandlers.js`, `cross-cut-modules/budget/app/crisisBudgetService.js`.

---

## What the system is for

Srulik's lab ingests multi-source text (news, radio, WhatsApp, field reports, PBO, social OSINT, etc.), extracts closed-vocabulary behavioral signals, runs **assessment agent + RAG investigation** (default), and presents **operator-safe** surfaces:

- **Attention queue** — what changed, what is thin, what is contested
- **Action compass** — ranked next steps during uncertainty (no numeric scores; `RESILIENCE_ACTION_COMPASS`, default on)
- **Anomaly strip** — OOV clusters, residual observations, and salience signals surfaced when epistemic mode is crisis/abstained
- **Epistemic banner** — data void, sampling blind, abstention modes
- **Evidence overview** — adequate / thin / contested component counts
- **Component lenses** — filter by needs-attention, thin, contested, or per-component
- **Claims and cited evidence** — proof before action (`evidence_tree` per component in UI; v2 `claims` with `evidence_refs` on disk)
- **Instrument flags** — sufficiency bands from epistemic/shadow policy, not headline scores

Shadow numeric scores remain in on-disk JSON under `daily_reports/` for analysts, drift tooling, and divergence review. API and operator UI **redact** headline scores at the boundary.

---

## Operator loop: scan → proof → decide

1. **Scan** — Epistemic banner + evidence overview + attention panel + **action compass** (`AttentionPanel.jsx`, `EpistemicStatusBanner.jsx`, `EvidenceOverviewPanel.jsx`, `ActionCompassPanel.jsx`). During crisis/abstention, **anomaly strip** highlights OOV/residual/salience signals that bypassed synthesizer prose.
2. **Proof** — Open component narratives and **claim-level evidence** (supporting/weakening refs); follow source links where available; optional chat drill-down via `list_attention_items` / `get_decision_brief` ([LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md)).
3. **Decide** — Human judgment; optional operator recommendations workflow (`OperatorRecommendationsPanel.jsx`, `/api/report/recommendations/*`). System may **abstain** (`insufficient_data`, `sampling_blind`, data void) — treat abstention as a prompt to ingest or wait, not “all clear.” When chat budget is exhausted during crisis epistemic conditions, report API may return `suggest_crisis_budget: true` ([COST-CONTROLS.md § Crisis chat budget](./COST-CONTROLS.md#crisis-chat-budget-cb-hybrid)). `shouldSuggestCrisisBudget` (`crisisBudgetService.js`) fires when daily/crisis budget is exceeded **and** (`data_void.level === 'critical'` OR `digital_darkness` OR `sampling_status === 'blind'` OR `assessment_mode === 'abstained'`).

**Crisis budget UI (where activation lives):**

| Role | Surface | Component |
|------|---------|-----------|
| **Operator** | Operator app `client/` | `EpistemicStatusBanner` shows `crisisBudget.operatorBanner` via `epistemicBannerMessages.js` when `suggest_crisis_budget` is true |
| **Analyst** | Operator app `client/` (not `analyst-site/`) | `CrisisBudgetPanel` in `MainApp.jsx`, gated by `canViewAnalyst` — HITL activate/deactivate crisis chat pool |

Analysts open the **operator app** (same origin as operators) to activate the pool; `analyst-site/` does not host `CrisisBudgetPanel`.

When the system shows **limited evidence** or hides a score, that is intentional (thin-evidence policy), not a bug.

---

## Display tiers

| Tier | App | API | What users get |
|------|-----|-----|----------------|
| **Operator (default)** | `client/` → `MainApp.jsx` passes `displayTier="operator"` to `ReportView` | `GET /api/report/today` default (`app/reportCacheService.js` → `getCachedReport`); `resolveDisplayView` → `operator` | Narratives, **evidence_tree**, instruments, attention, **action_compass**, **anomaly_strip**, recommendations, optional `suggest_crisis_budget`. **No** headline 1–10 scores, no drift alerts in attention. |
| **Analyst** | Separate SPA `analyst-site/` → `AnalystApp.jsx`, `?view=analyst` | Same report route when `canViewAnalystDisplay(email)` | Drift sparklines, validation review, catalog proposals, **agent trace replay**, shadow/divergence artifacts, drift-derived attention items, pipeline status. Scores still largely redacted at API; calibration uses drift APIs and on-disk JSON. |

Access: `config/userAccess.json` levels `analyst` / `maintainer`, or env `RESILIENCE_ANALYST_EMAILS` / `RESILIENCE_MAINTAINER_EMAILS` (`cross-cut-modules/auth/userAccess.js`).

Implementation: `redactReportPayload`, `redactAssessmentForView`, `deriveInstrumentState` in `assessmentDisplayTier.js`.

---

## What operators see instead of scores

Each component carries an **`instrument`** object (derived in code, not hand-authored):

| Field | Role |
|-------|------|
| `evidence_sufficiency` | `thin` / `moderate` / `adequate` (from evidence mass) |
| `thin_evidence_instrument` | Policy label: `insufficient_data`, `limited_evidence_neutral`, `unverified_alert`, `critical_single_signal`, `sampling_blind`, etc. |
| `operator_shows_score` | Rare exception when a critical single signal may show 1–10 (salience bypass) |
| `contested` / `contested_thin` | Mixed positive/negative evidence (polarization bands) |
| `significant_delta` | Material change vs prior report |
| `polarization_band`, `certainty_band` | Categorical bands safe for operators |
| `salience_critical`, `presence_gate_triggered` | Escalation without implying false precision |

Thin-evidence policy: `thinEvidencePolicy.js` (`RESILIENCE_THIN_EVIDENCE_POLICY=0` disables). High-salience bypass: `highSalienceBypass.js`.

Assessment-level epistemic overrides (data void, digital darkness): `deriveAssessmentEpistemicPolicy` — may set global `sampling_blind` and hide all scores.

---

## UI surfaces (operator app)

**Navigation** (`MainApp.jsx`): **Daily Assessment** (report) vs **data-source tabs** (News, Radio, Social, Trends, Visits, PBO, Pools, Report bot). **Write report** (header) opens the same guided report flow as the WhatsApp DM Report bot — see [PIPELINE-AND-SOURCES.md § Guided report](./PIPELINE-AND-SOURCES.md#guided-report-write-report--whatsapp-dm).

**Report view** (`ReportView.jsx`, operator tier):

1. Epistemic status banner
2. Evidence overview (instrument summary counts)
3. Attention panel (no drift-merge on operator tier)
4. **Action compass** — ranked operator actions from `buildActionCompass` in `actionCompass.js` (`action_compass` on report API); uncertainty band from `deriveUncertaintyBand` (data void, sampling, abstention); gap-closure tasks; **geo-unknown** warning when `geoUnknownReviewService` reports pending `new` queue items (resolution remains analyst HITL — see [GEOGRAPHIC-ANALYSIS.md § Analyst unknown queue](./GEOGRAPHIC-ANALYSIS.md#analyst-unknown-queue))
5. **Anomaly strip** — OOV/residual/salience visibility during crisis epistemic mode (`anomalyStrip.js`; `anomaly_strip` on report API); shown when epistemic mode is crisis/abstained and at least one OOV cluster or residual observation is present (see [MODEL-CARD.md](../MODEL-CARD.md))
6. Operator recommendations (when present)
7. Component filter bar + per-component sections (narrative, **claims/evidence tree**, instrument badges — not `/10` headline scores)
8. Docs panel, chat (grounded in report; hub tools complement action compass — see [LLM-CHAT-AND-AGENTS.md](./LLM-CHAT-AND-AGENTS.md))

**Analyst workspace** — header link when `canViewAnalyst`; separate origin (`getAnalystSiteUrl()`), not an in-app toggle. Three tabs in `AnalystApp.jsx`: **assessment** (report + validation/catalog panels), **drift** (`ResilienceDriftPanel`), **pipeline** (`PipelineStatusPanel`).

---

## Analyst workspace (calibration, not operations)

`analyst-site/src/AnalystApp.jsx` (separate SPA; URL from `client/src/lib/analystSiteUrl.js` → `getAnalystSiteUrl()`):

- **Scope:** `DistrictScopeSwitcher` in header; selected scope persisted in `localStorage` key `vibeswitch:analystScope` (`normalizeReportScopeId` from `reportScopes.js`)
- Fetches report with `view=analyst` for the active scope (`useTodayReport(scope, 'analyst')`)
- **Assessment tab:** `ReportView` + `ValidationReviewPanel`, `CatalogProposalPanel`, drift sparklines, agent trace when present; `useTranslatedReport` for i18n; inline outdated-report pipeline panel when report is stale
- **Drift tab:** `GET /api/resilience/drift` — component score history from **shadow** scores (`driftService.js`)
- **Pipeline tab:** `GET /api/monitoring/pipeline` — ingest/extract/assess stage health
- **Agent trace:** `GET /api/report/agent-trace/:traceId` — replay planner/specialist/critic/synthesizer steps
- **Chat FAB:** floating button opens `ChatPanel` with analyst tool profile; `handleOpenValidationInChat` pre-seeds validation context (`toolProfile: 'validation'`) when opened from `ValidationReviewPanel`
- Full assessment JSON still primarily on disk; use drift, divergence, validation routes, and trace for calibration

Operational decisions should use the **operator app** and instrument/narrative tier.

---

## API redaction summary

`assessmentDisplayTier.js` strips from operator payloads (non-exhaustive):

- Per-component numeric score keys (`score`, `score_smoothed`, `certainty`, `evidence_mass`, calibration fields, …)
- `overall_resilience_score`, facet/Norris numeric scores
- Narrative debug: `narrative_claims`, `grounding_issues`, `narrative_grounding_score`
- Macro signals summarized to counts/types for operators

Analyst tier keeps additional instrument detail (`suppression_delta`, truncated `top_contributors`) but is not a “full score dashboard” in the default API shape.

---

## Report file selection (wired)

**Primary implementation:** `business_modules/resilience_scorer/app/reportCacheService.js` — `resolveReportJsonPathForDate(date, { scope, reportsDir })`.

When multiple scoped variants exist for the same date (e.g. `resilience-report-2026-06-12-*.json`), the resolver picks the candidate with the **highest** `total_articles_analyzed`; on a tie, the **newest mtime** wins. Exact-path files (`resilience-report-{date}.json` or scoped prefix without suffix) are returned immediately when present.

The monitoring adapter (`cross-cut-modules/monitoring/infrastructure/adapters/reportPathResolver.js`) uses the same article-count + mtime rule for pipeline status.

**Pipeline replay guard:** `pipelineOrchestrator.assertAssessOnlySafe` uses `reportQualityRank(meta)` from `reportCacheService.js` (not quality-based file pick). Rank `0` = normal report with no active quarantine — replay `--assess-only` aborts unless `--force`. Rank `1` = non-`normal` assessment mode; rank `2` = active digital quarantine (safe to overwrite).

---

## Staging contract: `reportSelection.js`

**File:** `cross-cut-modules/resilience-contracts/reportSelection.js` — **not yet imported** by production code.

Defines an alternate ranking intended for operator-facing selection: penalizes `field_anchor_only` (+10), `abstained` (+20), `quarantineActive` (+5), then article count, then mtime via `isBetterReportCandidate`. When adopted, `reportCacheService` and `reportPathResolver` should import from this contract instead of duplicating logic. Do not add a third inline copy until wiring is done.

**Maintainer note:** `reportQualityRank` exists in both `reportCacheService.js` (replay guard) and `reportSelection.js` (staging contract) with **different ranking rules** — they can drift until production imports the contract. Do not change one without checking the other.

---

## Post-report side effects

**Event:** `RESILIENCE_REPORT_WRITTEN` — published by `assessSignalsCli.js` after each report write.

**Wired handlers:** `cross-cut-modules/messaging/app/registerModuleHandlers.js` subscribes to the event bus. Each side effect runs inside `runOnce(handlerId, …)` with idempotency via `processedEventStore` when configured.

| Handler id | Condition | Action |
|------------|-----------|--------|
| `log` | always | logs `resilience.report.written` |
| `rag-index` | `deps.retrievalService.indexReportForDate` present | indexes new report into RAG |
| `drift` | `deps.driftService.recordSnapshot` present | records drift snapshot |

Add new post-report side effects in `registerModuleHandlers.js` today.

**Staging:** `cross-cut-modules/messaging/app/reportEventHandlers.js` defines the same handler list as `REPORT_WRITTEN_HANDLERS` (Chain of Responsibility shape) for future extraction — not imported yet. When migrating, wire `registerModuleHandlers` to iterate that array instead of duplicating inline handlers.

---

## Related docs

- Engine stages, assessment agent, epistemic tiers: [RESILIENCE-ENGINE-REFERENCE.md](./RESILIENCE-ENGINE-REFERENCE.md)
- Daily artifact production: [PIPELINE-AND-SOURCES.md](./PIPELINE-AND-SOURCES.md)
- Firebase auth setup: [docs/IDENTITY_PLATFORM_SETUP.md](../IDENTITY_PLATFORM_SETUP.md); access tiers in `config/userAccess.json`
- Source archive retention: `db/input/purgeSourceArchive.js`, `db/source_archive/retentionPolicy.js` (ephemeral types purged after window; field/whatsapp retained)
- Cost guards and crisis chat budget: [COST-CONTROLS.md](./COST-CONTROLS.md)
- Policy tables: [docs/MODEL-CARD.md](../MODEL-CARD.md)
