# Population Resilience Monitor — Model Card

## Purpose

Decision-support instrument for Home Front Command: extracts **observable behavioral signals** from multi-source text, scores eight resilience components deterministically, and generates operator-safe narratives.

**Not an oracle.** Scores narrow attention; humans decide under explicit uncertainty.

## Architecture

```
LLM extract (closed vocabulary, ~165 tags) → verify evidence → deterministic score → LLM narrate (no re-scoring)
```

## Epistemic tiers

| Provenance | Scope | Metrics | Narrative |
|------------|-------|---------|-----------|
| `verified_geo` | Yes | Yes | Yes |
| `source_assigned` (field/PBO/WhatsApp) | Yes | Yes | Yes |
| `macro_national` | Context | **No** | Information environment |
| metrics-unsafe resolved geo | Yes (low confidence) | **No** | Context only |
| `insufficient_data` | — | Abstain | Abstain |

Feature flag: `RESILIENCE_EPISTEMIC_GEO_V2=0` disables metrics gating (legacy).

## Operator instruments (Option C — thin evidence)

When `evidence_mass < 1.5`:

| Condition | Operator sees |
|-----------|----------------|
| `salience_critical` (high-salience bypass) | `critical_single_signal` — **shows 1–10** with alert |
| Raw score inside [3,8] | `limited_evidence_neutral` — no 1–10 scale |
| Raw score outside [3,8] | `unverified_alert` — escalation, no scale |
| Zero signals | `insufficient_data` |

### High-salience bypass (Outlier Bypass)

When `evidence_mass < 1.5`, a verified high-stakes single signal may bypass the min-mass floor and surface as operator-visible. Gates (all required): one dominant contributor (≥85% mass), critical signal type or severe `event`, plus a credibility booster (high-trust evidence, field/PBO source, dual-pass agreement, or elevated scope). Floor skip is **asymmetric**: raw scores below 3 may pass through; thin positive hype above 8 remains capped. Flags: `salience_critical`, `floor_bypassed`, `salience_bypass_reasons`. Disable with `RESILIENCE_HIGH_SALIENCE_BYPASS=0`.

## Data void / digital darkness

Separate from component scores. Multi-channel EWMA baselines + z-score drop detection (`dataVoid/` module).

**Critical triggers:** `digital_darkness` (digital silent, field/PBO/`field_whatsapp` active), `total_silence`, `partial_silence`, `connectivity_outage`, `infrastructure_probe` outage.

**Epistemic gates (deterministic):**
- `level >= elevated` (non-darkness) → **abstention**: all component scores null, `assessment_mode: abstained`, operator instrument `sampling_blind`
- `digital_darkness` → **field-anchor-only**: re-score using field-family sources only; `assessment_mode: field_anchor_only`; stale digital-inclusive snapshot in `stale_digital_scores`
- `level === warning` → scores kept; `epistemic_status.sampling_status: degraded`

**Connectivity probes:** drop JSON/JSONL under `business_modules/resilience/data/connectivity-probes/`; ingested as `source_type: infrastructure_probe` (cap-exempt, high trust).

Flag: `RESILIENCE_DATA_VOID=0` disables void index.

| Env | Default | Effect |
|-----|---------|--------|
| `RESILIENCE_VOID_TOTAL_SILENCE_MIN_BASELINE` | 3 | Min expected digital volume for total-silence critical |
| `RESILIENCE_FIELD_SOURCE_MULTIPLIER` | 1.5 | Contribution multiplier for field-family sources |
| `RESILIENCE_FIELD_GEO_DISCOUNT` | 0.5 | Discount when field signal lacks geo/locality binding |

## Suppression transparency (analyst)

- `score_raw` — pre-cap, pre-floor
- `score_headline` — published score
- `suppression_delta` — raw − headline
- `suppression_breakdown.source_cap` / `min_mass_floor`

## Temporal analysis

- **Acute:** 14-day EWMA + z-score (`delta_significance`)
- **Chronic:** peace-time anchor (`business_modules/resilience/config/peaceTimeAnchors.json`) + `z_score_chronic`, `erosion_index`, `exhaustion_days`

Flag: `RESILIENCE_DUAL_BASELINE=0` disables chronic metrics.

## Presence gates

When `RESILIENCE_PRESENCE_GATES` is on (default), verified **grounded** signals of curated types force `operator_status: critical_failure` on mapped components (e.g. `infrastructure_damage_acute` → `functional_continuity`), independent of aggregate score. Operator instrument: `critical_presence_failure` (no 1–10). Flags: `presence_gate_triggered`, `presence_gate.rule_id`, `presence_gate.signal_type`.

## OOV burst (operator)

`assessment.oov_burst` evaluates `daily_reports/oov-capture-{date}.jsonl` unknown-type records **before scoring**. Operator attention when total ≥ `RESILIENCE_OOV_OPERATOR_MIN` (default 5) or largest cluster ≥ threshold.

During **abstention** (`sampling_blind`, `digital_darkness`, elevated `data_void`), the **anomaly strip** (`anomaly_strip` on report API) lowers the operator visibility threshold to cluster count ≥ 1 — surfaced in `OovAnomalyClustersPanel` with label “not in synthesis summary.”

**Synthesizer OOV coverage:** slim synthesizer mode retains `oov_claims`; `synthesisOovChecks.js` appends deterministic bullets and attention items when OOV clusters are missing from cross-component narrative.

**OOV scoring (default on):** alerting clusters synthesize `novel_behavior_observed` signals at reduced weight (`RESILIENCE_OOV_SCORE_WEIGHT`, default 0.4). `assessment.oov_scoring_applied` records synthetic count. Disable with `RESILIENCE_OOV_SCORING=0`.

## Action compass (operator, abstention)

When assessment abstains or epistemic instruments fire, `action_compass` on `GET /api/report/today` provides ordinal **uncertainty bands** (`unknown` | `watch` | `elevated` | `critical`) and ranked suggested actions — **no numeric 1–10 scores**. Sources: attention items, decision brief, gap closure tasks, void-specific defaults. UI: `ActionCompassPanel.jsx`. Flag: `RESILIENCE_ACTION_COMPASS` (default on).

## OSINT channel quarantine (auto)

Detect high polarization on `source_type=social` and `telegram` (`RESILIENCE_SOCIAL_QUARANTINE`, default on). When thresholds fire, **auto-exclude** OSINT from metrics (`RESILIENCE_OSINT_QUARANTINE_AUTO`, default on). Analyst **dismiss_social_quarantine** in validation UI suppresses auto-exclusion for that date+scope. Confirm remains for audit.

## Digital quarantine persistence

When partition quarantines digital signals, `assessment.digital_quarantine_state` persists until end of UTC day. Subsequent same-day assess runs reload prior state and block digital re-ingestion even if void index alone would not re-trigger.

## Assessment agent (v2, Option B)

Default pipeline (`RESILIENCE_ASSESSMENT_AGENT=1`): planner → component specialists → critic → synthesizer produce **assessment.v2** with evidence refs and trace JSONL. Legacy scoring runs as **shadow** (`RESILIENCE_SHADOW_SCORING=1`) → `shadow-scores-*.json`, `divergence-*.json`. Escape hatch: `RESILIENCE_ASSESSMENT_AGENT=0` restores legacy narratives.

| Env | Default | Effect |
|-----|---------|--------|
| `RESILIENCE_ASSESSMENT_AGENT` | `1` | Agent v2 primary assess path |
| `RESILIENCE_SHADOW_SCORING` | `1` | Write shadow score + divergence artifacts |
| `RESILIENCE_SHADOW_NARRATIVES` | `0` | Optional legacy narrative shadow |
| `RESILIENCE_ASSESSMENT_AGENT_MAX_USD` | `2.50` | Per-report agent budget |
| `RESILIENCE_ASSESSMENT_AGENT_MAX_ROUNDS` | `24` | Tool round cap |
| `RESILIENCE_ASSESS_DETERMINISTIC_PLANNER` | `1` | Skip planner LLM on routine normal days |
| `RESILIENCE_ASSESS_SLIM_PROMPTS` | `1` | Compact evidence graph in specialist prompts |
| `RESILIENCE_ASSESS_COMPRESS_TOOLS` | `1` | Cap multi-hop tool JSON returned to LLM |
| `RESILIENCE_ASSESS_TIERED_SPECIALISTS` | `1` | Tier A/B/C specialist depth (3 / 1 / 0 rounds) |
| `RESILIENCE_ASSESS_CONDITIONAL_SYNTH` | `1` | Skip Sonnet synthesizer on calm days |
| `RESILIENCE_ASSESS_SYNTH_GAP_THRESHOLD` | `3` | Open retrieval gap count triggering LLM synthesis |
| `RESILIENCE_ASSESS_SPLIT_INVESTIGATION_MASS` | `1` | Separate score mass vs investigation eligibility |
| `RESILIENCE_ASSESS_ARCHIVE_EPISTEMIC` | `1` | Archive mention mass hints from RAG hits |
| `RESILIENCE_ASSESS_RESIDUAL_FOR_AGENT` | `1` | Load residual/open observations into agent graph |
| `RESILIENCE_ASSESS_INVESTIGATION_OOV` | `1` | OOV burst includes residual kinds for agent |
| `RESILIENCE_ASSESS_REPLAN_HOP` | `1` | Single re-plan after specialist pass when warranted |
| `RESILIENCE_ASSESS_CROSS_COMPONENT_CHECK` | `1` | Detect grounded cross-component contradictions |
| `RESILIENCE_ASSESS_CONTESTED_ADVERSARIAL` | `1` | Require retrieve_for_claim both before submit on contested Tier A |
| `RESILIENCE_ASSESS_LAZY_RAG` | `1` | Planner runs before component RAG; seed only `focus_components` |
| `RESILIENCE_ASSESS_GLOBAL_RAG` | `1` | Global hybrid retrieve before specialists |
| `RESILIENCE_ASSESS_GLOBAL_TOPK` | `8` | Global retrieve final top-K (was 20) |
| `RESILIENCE_ASSESS_OPEN_RAG` | `1` | Per-component RAG seeding (set `0` to disable all) |
| `RESILIENCE_ASSESS_COMPACT_TOOL_LOOP` | `1` | Compact tool-loop message history via working memory |
| `RESILIENCE_ASSESS_PROMPT_CACHE` | `1` | Ephemeral cache on assess agent stable system blocks |
| `RESILIENCE_ASSESS_SLIM_PLANNER` | `1` | Compact planner epistemic profile + gap context |
| `RESILIENCE_ASSESS_SLIM_SYNTH` | `1` | Compact synthesizer component assessment payloads |

Report metadata: `investigation_plan.planner_source` (`deterministic`|`llm`|`replan`), `synthesis_mode`, per-component `specialist_tier`, `cross_component_issues`, `investigation_enrichment`.

Eval: `npm run agent:eval`. Trace replay: `GET /api/report/agent-trace/:traceId` (analyst).

## Extraction (cost-optimized)

| Env | Default | Effect |
|-----|---------|--------|
| `RESILIENCE_EXTRACT_CACHE` | `1` | Skip LLM when article hash + prompt version match cached signals |
| `RESILIENCE_EXTRACT_MULTIPASS` | `1` | `0` off; `1` three-pass; `2` two-pass (AB + C) |
| `RESILIENCE_EXTRACT_MAX_TOKENS` | `5000` | Lower default output cap vs legacy 12000 |
| `RESILIENCE_EXTRACT_BATCH` | off | Batch API for offline cron extract (`RESILIENCE_EXTRACT_BATCH=1`) |
| `RESILIENCE_EXTRACT_PROMPT_CACHE` | `1` | Ephemeral cache on stable extract system blocks |
| `LLM_PROMPT_CACHE` | `1` | Master prompt-cache gate (all features) |
| `CHAT_PROMPT_CACHE` | `1` | Cache chat tool template across tool rounds |
| `CHAT_COMPRESS_TOOLS` | `1` | Compress chat tool outputs returned to the model |
| `HOMEFRONT_PREFILTER_MODE` | `keyword` | Keyword/behavior prefilter; `llm` restores Haiku prefilter |

Prompt version: **`extract-v2`** (`cross-cut-modules/resilience-contracts/extractionPrompt.js`). Cache invalidates on bump.

Telemetry: per-invocation JSONL + `getLlmTelemetry()` feature rollup — see [COST-CONTROLS.md](./main_docu_files/COST-CONTROLS.md).

## Known limits

- Digital survivorship bias — people who do not post are invisible (mitigated by data_void + field priority)
- Closed vocabulary — novel behaviors logged to OOV; `novel_behavior_observed` adds low-weight scoring mass when clusters alert
- Residual capture (opt-in `RESILIENCE_RESIDUAL_CAPTURE=1`) — open-vocab observations for zero-signal articles
- Catalog gap report — `npm run signal-catalog-evolution:gap-report` clusters captures for analyst review
- Heuristic weights — author-set; RGR calibration via `signalWeightsFit.js` when ≥30 labeled reports
- Media repetition tracked separately as `media_mention_mass` — not merged into behavioral headline score

## Non-goals

- Measuring inner feelings or “true” societal mood
- Autonomous resource dispatch without human review
- Replacing field officer judgment

## Feature flags summary

| Flag | Default | Effect |
|------|---------|--------|
| `RESILIENCE_EPISTEMIC_GEO_V2` | on | Keyword/macro excluded from metrics |
| `RESILIENCE_DATA_VOID` | on | Data void index + epistemic gates |
| `RESILIENCE_THIN_EVIDENCE_POLICY` | on | Option C operator abstention |
| `RESILIENCE_DECISION_BRIEF_ENABLED` | on | Batch Haiku decision brief on `assessment.decision_brief` after assess |
| `RESILIENCE_DECISION_BRIEF_MODEL` | Haiku fallback | Model for decision brief generation |
| `RESILIENCE_HIGH_SALIENCE_BYPASS` | on | High-salience bypass for verified critical single signals |
| `RESILIENCE_DUAL_BASELINE` | on | Chronic baseline metrics |
| `RESILIENCE_OOV_CAPTURE` | on | Log unknown signal types, uncertain self-check, zero-signal articles |
| `RESILIENCE_OOV_OPERATOR_MIN` | 5 | OOV burst critical threshold (unknown-type count) |
| `RESILIENCE_PRESENCE_GATES` | on | Verified presence → critical_failure operator state |
| `RESILIENCE_SOCIAL_QUARANTINE` | on | Detect polarized OSINT (social + telegram) |
| `RESILIENCE_OSINT_QUARANTINE_AUTO` | on | Auto-exclude OSINT from metrics when polarized |
| `RESILIENCE_SOCIAL_QUARANTINE_MIN_SIGNALS` | 4 | Min OSINT signals to evaluate quarantine |
| `RESILIENCE_OOV_SCORING` | on | Synthesize `novel_behavior_observed` from OOV clusters |
| `RESILIENCE_OOV_SCORE_WEIGHT` | 0.4 | Contribution multiplier for OOV synthetic signals |
| `RESILIENCE_RESIDUAL_CAPTURE` | off | LLM residual pass on zero-signal articles (extra cost) |
| `RESILIENCE_SUPPRESSION_DELTA` | on | (always computed in scorer) |
| `RESILIENCE_EMBEDDING_SKIP_TYPES` | quote types | Skip embedding rescue for literal evidence types |
| `RESILIENCE_DUAL_REQUIRE_AGREEMENT` | on | When second extract enabled, keep intersection-only signals |
| `RESILIENCE_PROBE_SOURCE_ALLOWLIST` | (empty) | Allowed probe_source values; empty = allow all |
| `RESILIENCE_PROBE_MIN_CORROBORATION` | 2 | Min probes for critical probe_outage |
| `RESILIENCE_PROBE_HMAC_SECRET` | (unset) | Optional HMAC verification for probe JSON files |
| `RESILIENCE_WHATSAPP_MAX_SIGNALS_PER_SENDER` | 20 | Daily cap per WhatsApp sender |
| `RESILIENCE_WHATSAPP_HOURLY_TYPE_CAP` | 5 | Same-type hourly cap per sender |
| `WHATSAPP_ALLOWED_DM_PHONES` | (empty) | DM allowlist; empty = allow all |
| `RESILIENCE_OUTLET_DECAY` | on | Dynamic outlet reputation from verification/dedup |
| `RESILIENCE_GEO_EXACT_ONLY` | off | Skip fuzzy geo; unmatched → NO_CONFIDENT_MATCH |
