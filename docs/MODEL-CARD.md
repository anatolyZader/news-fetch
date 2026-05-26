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
| Raw score inside [3,8] | `limited_evidence_neutral` — no 1–10 scale |
| Raw score outside [3,8] | `unverified_alert` — escalation, no scale |
| Zero signals | `insufficient_data` |

## Data void / digital darkness

Separate from component scores. Fires when digital streams drop to zero while field/PBO reports continue, or when `connectivity_outage` tags appear.

Flag: `RESILIENCE_DATA_VOID=0` disables.

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
| `RESILIENCE_DATA_VOID` | on | Data void index |
| `RESILIENCE_THIN_EVIDENCE_POLICY` | on | Option C operator abstention |
| `RESILIENCE_DUAL_BASELINE` | on | Chronic baseline metrics |
| `RESILIENCE_OOV_CAPTURE` | on | Log unknown signal types, uncertain self-check, zero-signal articles |
| `RESILIENCE_RESIDUAL_CAPTURE` | off | LLM residual pass on zero-signal articles (extra cost) |
| `RESILIENCE_SUPPRESSION_DELTA` | on | (always computed in scorer) |
