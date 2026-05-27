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

## Known limits

- Digital survivorship bias — people who do not post are invisible (mitigated by data_void + field priority)
- Closed vocabulary — novel behaviors captured via OOV log (`reports/oov-capture-*.jsonl`), not scored
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
| `RESILIENCE_RESIDUAL_CAPTURE` | off | LLM residual pass on zero-signal articles (extra cost) |
| `RESILIENCE_SUPPRESSION_DELTA` | on | (always computed in scorer) |
