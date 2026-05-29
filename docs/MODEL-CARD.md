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

`assessment.oov_burst` evaluates `reports/oov-capture-{date}.jsonl` unknown-type records **before scoring**. Operator attention when total ≥ `RESILIENCE_OOV_OPERATOR_MIN` (default 5) or largest cluster ≥ threshold.

**OOV scoring (default on):** alerting clusters synthesize `novel_behavior_observed` signals at reduced weight (`RESILIENCE_OOV_SCORE_WEIGHT`, default 0.4). `assessment.oov_scoring_applied` records synthetic count. Disable with `RESILIENCE_OOV_SCORING=0`.

## OSINT channel quarantine (auto)

Detect high polarization on `source_type=social` and `telegram` (`RESILIENCE_SOCIAL_QUARANTINE`, default on). When thresholds fire, **auto-exclude** OSINT from metrics (`RESILIENCE_OSINT_QUARANTINE_AUTO`, default on). Analyst **dismiss_social_quarantine** in validation UI suppresses auto-exclusion for that date+scope. Confirm remains for audit.

## Digital quarantine persistence

When partition quarantines digital signals, `assessment.digital_quarantine_state` persists until end of UTC day. Subsequent same-day assess runs reload prior state and block digital re-ingestion even if void index alone would not re-trigger.

## Known limits

- Digital survivorship bias — people who do not post are invisible (mitigated by data_void + field priority)
- Closed vocabulary — novel behaviors logged to OOV; `novel_behavior_observed` adds low-weight scoring mass when clusters alert
- Residual capture (opt-in `RESILIENCE_RESIDUAL_CAPTURE=1`) — open-vocab observations for zero-signal articles
- Catalog gap report — `npm run catalog-learning:gap-report` clusters captures for analyst review
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
