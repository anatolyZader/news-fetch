# 05 - Epistemics and Instruments

## What this answers

- How the system reasons about **evidence quality** rather than just producing a number.
- **Evidence mass**, **source caps**, and **certainty** - the building blocks of honest uncertainty.
- The **user instrument** that replaces the headline score.
- Exactly **why and how** the 1-10 score is hidden from users (`display_view` redaction).

## 1. Why epistemics matter here

A district officer must know not only *what* the picture is, but *how much to trust it*. The system therefore separates two questions:

1. **What does the evidence support?** -> the assessment agent's claims (file 04).
2. **How solid is that evidence?** -> the **epistemic layer** described here.

The epistemic layer is what lets the system say "thin," "contested," or "insufficient_data" instead of pretending every reading is equally firm.

## 2. Evidence mass, caps, and certainty

These live under `business_modules/resilience_scorer/domain/epistemic/` and `business_modules/specialist_agents/domain/services/`.

### 2.1 Mass (how much evidence landed)

`massContribution.js` (`contributionForSignal`) computes a per-signal **mass** from a product of factors: signal weight x scope x intensity x reliability x outlet prior x temporal decay x grounding, with field/geo discounts. `componentItems.js` (`collectComponentItems`) maps signals into positive/negative **polarity items**, discounting duplicate articles.

Profile computation (`epistemicProfileBuilder.js`, `computeEpistemicProfile`):

- `evidence_mass` = capped positive + capped negative contributions.
- `thin_evidence` = mass below ~1.5.
- `certainty` = `1 - exp(-evidence_mass / certM)` (per-component `certM`).
- `polarization` = `1 - |net| / mass`; `contested` when polarization is high with enough mass.

### 2.2 Source caps (anti echo-chamber)

`evidenceCaps.js` (`applySourceCap`) prevents any one channel or outlet from dominating:

- No single `source_type` may contribute more than **50%** of polarity mass on either arm.
- No single `article_source` (outlet) may contribute more than **42%**.
- Some source types are exempt (`CAP_EXEMPT_SOURCE_TYPES`).

This means twenty echoes of the same news outlet cannot manufacture certainty; multi-channel agreement is what moves the needle.

### 2.3 Investigation mass (separate track)

For the agent, a separate `enrichProfileForInvestigation` computes `investigation_mass`, `thin_for_investigation`, and `investigation_eligible` (adding archive/residual/OOV bonuses). This drives planner/specialist **abstention** (file 04) and is distinct from scoring mass.

## 3. The user instrument (what replaces the score)

Instead of a 1-10, the user sees an **instrument** derived by `deriveInstrumentState` (`business_modules/resilience_scorer/domain/services/assessmentDisplayTier.js`, line 75):

```js
{
  confidence,
  evidence_sufficiency: 'thin' | 'moderate' | 'adequate',
  contested, contested_thin, significant_delta,
  user_status, evidence_mass,
  polarization, polarization_band,
  certainty_band, user_shows_score,
  thin_evidence_instrument, ...
}
```

This communicates "how much to trust this, and is it changing" without inviting false precision. User display states (`insufficient_data`, `evidence_quarantined`, `specialist_skipped`) come from `business_modules/resilience_scorer/domain/services/componentDiagnostics.js`.

## 4. The headline 1-10: present internally, hidden from users

The deterministic score still exists - it is useful for developers calibrating the system - but it is treated as **secondary** and is **redacted** for users.

### 4.1 Where the score comes from

The only sanctioned bridge from the resilience module into the scoring code is `business_modules/resilience_scorer/app/scoringFacade.js`, re-exporting `scoreComponents` / `overallScore` from `business_modules/resilience_scorer/developer/`. In the daily run it produces the **shadow** score, compared against the agent assessment for divergence - not merged into the user's component claims.

### 4.2 The gates and redactions that hide it

| Layer | Mechanism |
|-------|-----------|
| Agent output | `mapAssessmentV2ToLegacy` sets `overall_resilience_score: null` |
| Epistemic gate | `applyScoreAbstention` (`business_modules/resilience_scorer/domain/services/dataVoid/epistemicGate.js`) nulls scores and sets `epistemic_abstention` / `confidence: 'insufficient_data'` when the evidence void is elevated/critical |
| API redaction | `redactReportPayload` / `redactAssessmentForView` strip per-component scores, `overall_resilience_score`, shadow scoring, and component diagnostics for users |
| Display-view auth | `resolveDisplayView` grants `developer` only to allow-listed users; everyone else is `user` |
| Thin-evidence policy | sets `user_shows_score: false` when mass is too low / abstaining / sampling-blind |
| Markdown | `...-brief.md` is written with `includeScores: false` |
| Chat | scores included only when `display_view === 'developer'`; users get a user summary |

Display view resolution:

```11:17:cross-cut-modules/resilience-contracts/displayViews.js
export function resolveDisplayView({ queryView, canViewDeveloper = false } = {}) {
  const requested = String(queryView ?? 'user').trim().toLowerCase();
  if (requested !== DISPLAY_VIEWS.developer) {
    return DISPLAY_VIEWS.user;
  }
  return canViewDeveloper ? DISPLAY_VIEWS.developer : DISPLAY_VIEWS.user;
}
```

### 4.3 Why

A district officer producing twice-daily situation reports is better served by **claims + evidence + uncertainty** than by a single, easily-misread number - especially when evidence is thin or one-sided. The score is retained for developers (calibration, drift, tuning) but is deliberately kept off the user surface. This is the concrete expression of "decision support, not scoring" (file 01).

## 5. Reading the instruments (user cheat-sheet)

| Instrument | What it tells the officer |
|------------|---------------------------|
| `evidence_sufficiency` | Is there enough evidence to lean on this at all? |
| `confidence` / `certainty_band` | How firm is the reading given the evidence mass |
| `contested` / `polarization_band` | Is the picture mixed (pro and con) vs one-sided |
| `significant_delta` | Is today a meaningful change vs recent days |
| `user_status` | `stable` / `watch` / `critical_failure` / `insufficient_data` |
| `user_shows_score` | Whether a score would even be defensible here (usually false for users) |

## 6. Key code locations

| Concern | Path |
|---------|------|
| Mass per signal | `business_modules/resilience_scorer/domain/epistemic/massContribution.js` |
| Component polarity items | `business_modules/resilience_scorer/domain/epistemic/componentItems.js` |
| Source caps (50% / 42%) | `business_modules/resilience_scorer/domain/epistemic/evidenceCaps.js` |
| Certainty tuning | `business_modules/resilience_scorer/domain/epistemic/certaintyTuning.js` |
| Epistemic profile | `business_modules/resilience_scorer/domain/epistemic/epistemicProfileBuilder.js` |
| Investigation abstention | `business_modules/specialist_agents/domain/services/investigationEpistemic.js` |
| Instrument + redaction | `business_modules/resilience_scorer/domain/services/assessmentDisplayTier.js` |
| Score abstention gate | `business_modules/resilience_scorer/domain/services/dataVoid/epistemicGate.js` |
| User display states | `business_modules/resilience_scorer/domain/services/componentDiagnostics.js` |
| Scoring bridge | `business_modules/resilience_scorer/app/scoringFacade.js` |
| Display view | `cross-cut-modules/resilience-contracts/displayViews.js` |

## 7. Dual epistemic status (monitoring replays)

On `digital_darkness` days the report carries **two** epistemic surfaces:

| Field | Use for |
|-------|---------|
| `assessment.epistemic_status` | Investigation pool context (`investigation_mode: digital_darkness`); may show `void_level: none` while investigation signals stay available |
| `assessment.shadow_scoring.epistemic_status` | **Score reliability** — `void_level`, `assessment_mode: field_anchor_only`, `scores_reliable` |
| `assessment.digital_quarantine_state` | Active quarantine flag + `assessment_mode` for the scoring partition |

**Users and replay QA:** trust `user_display_state` / `evidence_user` on components, plus `shadow_scoring.epistemic_status` and `digital_quarantine_state` — not top-level `epistemic_status.void_level` alone.

Post-run checklist: `npm run pipeline:audit -- --date YYYY-MM-DD --scope north`.
