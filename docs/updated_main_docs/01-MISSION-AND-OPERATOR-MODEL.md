# 01 - Mission and Operator Model

## What this answers

- What the system is *for*, and what it deliberately is *not*.
- Why it is a **decision-support** system rather than a scoring mechanism.
- Who the operator is: a **district-level population-behavior officer** in the northern district, not a local emergency responder.
- The **twice-daily report** workflow and what that means in practice.
- Why **abstention** ("insufficient data") is a valid, intended outcome.

## 1. The mission

The system answers a single recurring question for the northern district of Israel:

> Given everything we observed across the district in the last few days, **how is the civilian population coping**, where is **resilience under strain**, and **what is the evidence**?

It is built so a human officer can read a small number of **evidence-backed claims**, judge them, and write a high-quality situation report. The machine **organizes evidence and reasons about it**; the human **decides**. This separation is intentional and is enforced throughout the codebase (see sections 3 and 5).

## 2. Decision support, not scoring

It is tempting to imagine this product as "a number from 1 to 10 for community resilience." That is explicitly **not** the operator-facing product.

### 2.1 What the operator actually receives

- **Component assessments** for the eight Home Front Command resilience components, each with a `severity`, a `confidence`, an `operator_status` (`stable` / `watch` / `critical_failure` / `insufficient_data`), a short **narrative**, and a list of **claims** with **evidence references**.
- A **cross-component synthesis** and a **decision brief** (advisory summary + priority items).
- **Attention items** - a ranked queue of what deserves a closer look.
- **Instruments** that describe evidence quality: is the evidence **thin** or **adequate**, is the picture **contested**, is today a **significant change** versus recent days.

### 2.2 What is hidden from the operator

A headline **1-10 resilience score** (and per-component numeric scores, confidence intervals, score drift, etc.) still exists internally. It is produced by a deterministic scoring path (`business_modules/resilience/app/scoringFacade.js`, which is the *only* allowed bridge into `analyst/scoring/`). But for operators it is treated as a **shadow / analyst-only** artifact and is **redacted at the API and UI**:

- `cross-cut-modules/resilience-contracts/displayViews.js` resolves a `display_view` of `operator` or `analyst`. Analyst is only granted to allow-listed users.
- `business_modules/resilience/domain/services/assessmentDisplayTier.js` (`redactReportPayload`, `redactAssessmentForView`) strips numeric scores, `overall_resilience_score`, shadow scoring, and component diagnostics for the operator view.
- The operator-facing markdown brief (`...-brief.md`) is generated with `includeScores: false`.

**Why hide it?** A single number invites over-trust and false precision, especially when evidence is thin or one-sided. The design forces the operator to engage with *claims and evidence quality* instead of anchoring on a score. The score remains available to analysts for calibration and methodology work. See file 05 for the mechanics.

## 3. Who the operator is

The intended user is a **population-behavior officer at the district level** (northern district). This shapes every product decision.

### 3.1 District officer vs local emergency specialist

| Dimension | Local emergency specialist (NOT the user) | District population-behavior officer (the user) |
|-----------|-------------------------------------------|--------------------------------------------------|
| Time horizon | Seconds to minutes; immediate response | Half-day to multi-day; situational understanding |
| Trigger | Each urgent incident | Accumulated, district-wide behavioral patterns |
| Geographic scope | A specific site or town | The **whole northern district** across subregions |
| Output | Dispatch / immediate action | **Two thoughtful situation reports per day** |
| Decision style | React now | Synthesize evidence, then advise |
| What "good" looks like | Fast, correct response | Well-grounded, calibrated, honest-about-uncertainty report |

The officer is **not** expected to react to each event as it happens. They are expected to **provide quality reports based on a thorough analysis** of district data. This is why the system optimizes for evidence organization, multi-source corroboration, and uncertainty disclosure rather than for low-latency alerting.

### 3.2 The northern-district lens

The officer works at the scope `north`, which the system treats as the **entire northern district** aggregated across its subregions (`naftali`, `golan`, `baram`, `hiram`, `galma`; see `business_modules/geo/domain/value_objects/northSubregionId.js`). A north report is not about one settlement - it is the district picture, with national context attached for comparison. Geography is covered fully in file 03.

## 4. The twice-daily report workflow

The officer's operational responsibility is to produce **two situation reports per day** (for example, a morning read and an afternoon/evening read), each based on a fresh, thorough analysis of incoming district data.

**Important - what the code actually schedules.** The system is built to *support* this human cadence, but it does not contain a "morning + evening" scheduler:

- The bundled cron example runs the full pipeline **once daily, Sunday-Thursday, at 15:00 Israel time** (`scripts/README.md`, `scripts/daily-pipeline.sh`).
- The assessment CLI (`business_modules/resilience/app/assessSignalsCli.js`) writes each run to a filename stamped with an `HHMM` time suffix (e.g. `resilience-report-north-2026-06-13-0930.json`), so **running the pipeline more than once per day is fully supported**.
- The report cache (`business_modules/resilience/app/reportCacheService.js`) resolves the "best" report for a date (most articles analyzed, then newest), so multiple same-day runs coexist cleanly.

So "twice daily" is a **workflow the officer follows**, executed by invoking the pipeline (or a scheduled job) at two points in the day. The radio source separately captures two recording windows per day (06:00-09:00 and 09:00-12:00 via `business_modules/radio/input/setup-tzafon.js`), which is an ingestion detail, not a report schedule.

## 5. Humans decide; the machine never acts

The system is advisory by construction:

- The **decision brief** prompt explicitly forbids assigning numeric 1-10 scores and forbids claiming that any resource was dispatched; `suggested_next_step` must be **advisory** (`decisionBriefPrompt.js`).
- Chat actions that would change state are **propose-only** and require human confirmation (the chat module's `propose_*` tools; see file 06).
- Operator **recommendations** can be acknowledged or dismissed by a human via the report API.

## 6. Abstention is a valid outcome

A defining property: when evidence is insufficient, the system says so, and that is treated as a correct answer - not as "everything is fine."

Abstention is enforced at multiple layers (detailed in files 04 and 05):

- **Planner**: components with too little investigative mass are placed in `abstention_components`.
- **Specialist**: returns `severity: 'abstain'`, `operator_status: 'insufficient_data'`, and empty claims when it cannot ground an assessment.
- **Critic**: downgrades over-confident, thinly-supported assessments toward abstention.
- **Scoring gate**: nulls the score and sets `epistemic_abstention` when the evidence void is elevated/critical.
- **Operator display / instruments**: surfaces `insufficient_data`, `evidence_quarantined`, `specialist_skipped` rather than fabricating a clean reading.

The operating principle: **an honest "we don't know yet" is more useful to a district officer than a confident guess.**

## Key code locations

| Concern | Path |
|---------|------|
| Display view resolution (operator vs analyst) | `cross-cut-modules/resilience-contracts/displayViews.js` |
| Operator redaction of scores | `business_modules/resilience/domain/services/assessmentDisplayTier.js` |
| Scoring bridge (analyst-only headline /10) | `business_modules/resilience/app/scoringFacade.js` |
| Northern-district subregions | `business_modules/geo/domain/value_objects/northSubregionId.js` |
| Daily pipeline cron / cadence | `scripts/README.md`, `scripts/daily-pipeline.sh` |
| Report time-suffix + output | `business_modules/resilience/app/assessSignalsCli.js` |
| Decision-brief advisory rules | `business_modules/resilience/domain/services/decisionBriefPrompt.js` |
