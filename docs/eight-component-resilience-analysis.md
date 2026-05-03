# Eight-component community resilience analysis (as implemented in this app)

This document explains the **8-component resilience assessment** the way the codebase models it: what each component means, how evidence becomes a **1–10 score**, what **confidence** means in the UI, and how the daily report is assembled for the web client.

It is written to match the implementation in:

- `business_modules/resilience/domain/resilienceComponents.js` (definitions + guiding questions)
- `business_modules/resilience/domain/services/behaviorSignals.js` (signal taxonomy + deterministic scoring)
- `business_modules/resilience/infrastructure/claudeEvaluator.js` (LLM extraction + narrative synthesis constraints)
- `client/src/components/ReportView.jsx` (how the report is presented)

---

## 1) What “community resilience” means in this system

The app’s canonical definition is embedded in `resilienceComponents.js`:

- Resilience is the community’s ability **during and after** a crisis to **leverage resources**, **adapt**, **continue functioning**, deliver **essential services**, and protect **physical and mental health**.

The eight components are explicitly framed as a **Home Front Command** style assessment model (the file cites Pikud HaOref / פיקוד העורף methodology and references Fran Norris 2008 as a conceptual anchor).

---

## 2) End-to-end pipeline (what happens before you see the report)

At a high level, the system is intentionally split into **auditable stages**:

1. **Ingest text** from multiple sources (news markdown bundles, radio transcripts, WhatsApp exports, field reports, structured PBO inputs, questionnaires, etc.).
2. **Extract atomic “signals”** using an LLM with a **closed vocabulary** of `signal_type` values (the model must not invent new signal types).
3. **Map signals → components deterministically** in code (`SIGNAL_TO_COMPONENTS`), including **positive and negative weights** per component.
4. **Score each component deterministically** from the weighted evidence (`scoreComponents`).
5. **Write narratives** with an LLM **without re-scoring** (the narrative model is instructed that scores are already final; it must justify them using the evidence payload).

This split is documented directly in `behaviorSignals.js` (“LLM extracts → code maps & scores”).

---

## 3) Evidence unit: a “signal”

A signal is intended to be **one behavioral fact** extracted from source text, with metadata such as:

- `signal_type` (closed enum)
- `evidence` (short quoted/paraphrased evidentiary text)
- `scope_level` (`single_case`, `repeated_pattern`, `quantified_or_broad`)
- `evidence_type` (a reliability class such as `observational_reported_fact`, `named_survey_statistic`, etc.)
- provenance fields used for breadth/dispersion (`article_url` or `article_index`, `article_source`, `source_type`, …)

The scoring model treats each signal as contributing evidence mass to one or more components according to `SIGNAL_TO_COMPONENTS`.

---

## 4) Deterministic scoring model (what the 1–10 number means)

Implemented in `scoreComponents` (`behaviorSignals.js`).

### 4.1 Per-signal contribution

For each signal `s` and each affected component `c`:

\[
\text{contribution}(s,c)=|w_{s,c}|\times \text{scopeWeight}\times \text{reliability}\times \text{temporalWeight}
\]

- `w_{s,c}` is the mapping weight from `SIGNAL_TO_COMPONENTS` (can be negative).
- `scopeWeight` defaults to `single_case` if missing.
- `reliability` defaults to `observational_reported_fact` if missing.
- `temporal_weight` defaults to `1.0` (used when merging multi-day signal bundles).

The implementation accumulates separate **positive** and **negative** totals for each component.

### 4.2 Evidence mass, direction, and “strength”

- `evidence_mass = positive + negative`
- `net_evidence = positive - negative`
- `strength = tanh(net_evidence / k)` with `k = 2.5`

So the model is explicitly **S-shaped**: very large net evidence eventually saturates (tanh), reducing sensitivity to a single outlier flood of same-direction signals.

### 4.3 Coverage and diversity adjustments (penalize “one article / one source / one signal type says everything”)

Let `distinctArticleCount` be the number of distinct articles referenced by contributing signals (via `article_url` or `article_index`), and `totalArticles` the batch size passed into scoring.

- `coverage_ratio = distinctArticleCount / totalArticles` (0 if `totalArticles` is 0)
- `coverage_adjustment = 0.70 + 0.30 * sqrt(coverage_ratio)` (ranges ~0.70–1.00)
- `source_diversity_factor = 0.85 + 0.15 * min(1, (sourceTypes − 1) / 3)` — saturates at 4 distinct source types (news / radio / field / pbo / naftali / whatsapp …)
- `signal_type_entropy = H(typeCounts) / log(distinctTypes)` — Shannon entropy of the signal-type distribution, normalised to [0, 1]
- `type_diversity_factor = 0.90 + 0.10 * signal_type_entropy`
- `adjusted_strength = strength * coverage_adjustment * source_diversity_factor * type_diversity_factor`

This is the app’s way of encoding three constraints simultaneously: **breadth across the corpus**, **diversity of source channels**, and **variety of signal types** all matter, not only net direction. A flood of one signal type from one source produces a much smaller adjusted strength than the same evidence mass spread across multiple types and channels.

### 4.3a Per-source caps and minimum-mass floor (4f, N5)

Three anti-fragility rules are applied before computing `strength`:

- **Source-type cap (50%)** — when ≥2 source types are present, no single `source_type` (news, radio, field, pbo, …) contributes more than 50% of the polarity mass for the component. Catches cross-channel imbalance ("the entire positive case comes from press").
- **Per-`article_source` cap (35%, N5)** — when ≥2 distinct outlets are present, no single `article_source` (e.g. `ynet.co.il`, `maariv.co.il`) contributes more than 35% of the polarity mass for the component. Catches *within-channel* imbalance ("press is diverse, but 90% of the press case is a Ynet flood") that the source-type cap alone misses. The two caps compose: the source-type pass runs first, then the article-source pass refines the result.
- **Min-mass floor** — if `evidence_mass < 1.5`, the rounded score is clamped into `[3, 8]`. Thin single-signal evidence cannot push a score to the extremes.

Both caps use the same scaling math: if a bucket exceeds its threshold, every contribution from that bucket is scaled by `targetMass / mass` where `targetMass = threshold · otherMass / (1 − threshold)`. For threshold=0.5 this collapses to "dominant mass = sum of other mass" (the original behavior).

### 4.4 Certainty, polarization, and the final 1–10 score

The `tanh K` and certainty `m` constants are now **per-component**, set so denser components (lifesaving / continuity) stop saturating early and sparse ones (narrative / belonging) stop sitting permanently low-confidence:

| Component | `tanhK` | `certM` |
|---|---|---|
| `narrative` | 1.8 | 1.4 |
| `information_communication` | 2.5 | 2.0 |
| `lifesaving_behavior` | 3.2 | 2.6 |
| `functional_continuity` | 2.5 | 2.0 |
| `community_capital` | 2.2 | 1.8 |
| `leadership` | 2.2 | 1.8 |
| `belonging_solidarity` | 1.8 | 1.4 |
| `wellbeing_atrisk` | 2.5 | 2.0 |

These values are **author-set heuristics**, not data-fit; they will be revisited once 30+ days of report history exists for a regression-based recalibration.

- `strength = tanh(net_evidence / tanhK_c)` per component `c`
- `certainty = 1 − exp(−evidence_mass / certM_c)` per component `c`
- `polarization = evidence_mass > 0 ? 1 − |net|/mass : 0` — surfaces "contested evidence" cases (positive ≈ negative, both large) which previously collapsed to score≈5.5 indistinguishably from "no evidence". Rendered as a "contested evidence" badge in the UI when `polarization > 0.5 && evidence_mass > 4`.
- `extraction_confidence` (0–1, model-self-rated) multiplies into each signal's reliability so hedged extractions count less.

Final score:

\[
\text{score}=\text{round}\big(\text{clamp}_{[1,10]}(5.5 + 4.5 \times \text{adjusted\_strength})\big)
\]

(With the additional clamp into `[3, 8]` when `evidence_mass < 1.5`, see 4.3a.)

Interpretation:

- **5.5 is neutral** (maps to “moderate” band in UI labeling when rounded to whole numbers).
- The **±4.5** range maps the adjusted directional strength into the 1–10 scale.

### 4.4a Bootstrap 90% confidence interval (4d)

For every component the score is paired with a bootstrap CI (`score_low`, `score_high`):

- 200 resamples-with-replacement from the per-signal contribution items (deterministic seed: stable across runs and tests)
- The same per-source cap and min-mass floor are applied to each resample so the CI reflects exactly the same model the headline score uses
- 5th / 95th percentiles of the resample distribution become `score_low` / `score_high`

The CI is rendered as `7 (CI: 6–8)` in the UI and `90% CI: 6–8` in the markdown report.

### 4.4b Counterfactual leverage (C3)

For each component, "removing the dominant article changes the score by Δ":

- Group contribution items by `article_url || article_index`, find the article with the largest |mass|, recompute the score without those signals.
- Output `counterfactual_article_key` and `counterfactual_delta`.
- The UI surfaces this when `|delta| ≥ 1` as: *"removing the dominant article would change this score by ±N"*.

### 4.4c EWMA smoothing and delta-significance channel (4e)

`assess-signals.js` reads the trailing 14 days of `reports/resilience-report-*.json` and per component computes:

- `score_smoothed = round(α × score_today + (1 − α) × yesterday)` with `α = 0.3 + 0.5 × certainty_today` (so high-certainty days move the smoothed line faster).
- `delta_score = score_today − score_yesterday`.
- `delta_significance = (score_today − mean_14d) / stddev_14d` (z-score against the trailing 14-day distribution; null when fewer than 2 prior days or zero variance).
- `delta_flag = 'significant'` when `|delta_significance| > 2`.

The chip row shows `Δ+1` / `Δ−1` adornments; significant deltas are coloured/outlined. The full delta line in the open card adds the z-score and explicitly labels significant changes. Narrative prompt rules tell the LLM to mention "a notable shift vs the 14-day baseline" for flagged components without inventing magnitude.

### 4.5 Confidence display in the UI

Two presentations are available, both derived from the same underlying data:

- **Bucket label** (kept for back-compat with `t('confidence.*')`): `low` if `certainty < 0.35` OR only one distinct article contributes; `medium` if `certainty < 0.70` OR fewer than 4 distinct articles; else `high`. `insufficient_data` when no signals contribute (rendered as a muted, dashed-border card so it is visually distinct from "low").
- **Numeric interval**: `7 (CI: 6–8)` shown directly under the component title using the bootstrap CI from 4.4a. When the CI collapses to the headline score (e.g. very tight evidence), only the bare score is rendered.

### 4.6 Overall score

`overallScore` is a **certainty-weighted mean** of component scores (components with near-zero certainty do not dominate).

---

## 5) How the web report is structured (what the user sees)

`ReportView.jsx` renders:

1. **Overall resilience** (`assessment.overall_resilience_score`) with the same 1–10 label bands as components (`scoreLabel10` thresholds).
2. A row of **component chips** (scores + band labels).
3. An **executive synthesis** (`assessment.cross_component_synthesis`).
4. Eight **component cards**, each containing:
   - A **markdown narrative** (`comp.narrative`) — generated under constraints that it must trace to evidence.
   - An optional **evidence accordion**:
     - If `scoreBySource` is present, the UI can show **raw signals** grouped from `score_by_source` (badges for `field`, `radio`, `naftali`, `press/news`, `pbo`).
     - Otherwise it shows curated evidence strings (`comp.evidence`).

Important nuance: the narrative step is explicitly instructed (in `claudeEvaluator.js`) **not to re-score**; it must treat scores as fixed and write behavioral explanations grounded in the evidence payload.

---

## 6) The eight components (definitions + how signals route into them)

Below, each component’s **meaning** and **guiding questions** come from `RESILIENCE_COMPONENTS`.

The **“typical signals”** bullets are a practical summary derived from `SIGNAL_TO_COMPONENTS`: they list signal types that materially push/pull that component (not every signal that touches it with a tiny cross-weight).

**Per-component facets (T4, expanded by N6):** every component now has 2–4 *facets* — sub-bars in the UI defined in `componentFacets.js`. Facets are scored with the same directional math (no cap, no bootstrap, to keep them cheap). The current set:

| Component | Facets |
|---|---|
| `narrative` | mood, coping_story, competing_narratives |
| `information_communication` | clarity, accessibility, actionability |
| `lifesaving_behavior` | compliance, knowledge, enforcement |
| `functional_continuity` | essential_services, system_load, economic, recovery |
| `community_capital` | mobilization, local_capacity, external_dependency |
| `leadership` | visibility, credibility, coordination |
| `belonging_solidarity` | mutual_aid, cohesion, inclusion |
| `wellbeing_atrisk` | physical_harm, psychological_distress, care_access |

Every signal type listed in a facet routes into its parent component via `SIGNAL_TO_COMPONENTS` (enforced by a unit test). Facets are intentionally narrow — they expose *where* inside a component the evidence is concentrated; flat headlines often hide a clear sub-facet drift.

### 6.1 `narrative` — Narrative (נרטיב)

**What it measures (per framework text):** the public story around the crisis and whether it supports or undermines coping; credibility/relevance of official narratives; coexistence of competing narratives.

**Guiding questions (verbatim intent from code):**

- Is there a dominant narrative of successful coping?
- Is the official narrative credible/relevant to the population?
- Are contradictory narratives undermining the shared story?

**Behavioral manifestations (examples from code):** circulating coping story; inclusivity of the story; credibility statements; explicit competing narratives.

**Primary signal types routed strongly into this component:**

- `resilience_narrative_positive` / `resilience_narrative_negative` (core narrative evidence)
- `rumor_spread` (also pulls narrative slightly negative, reflecting narrative/info contamination)

**Related signals that are *not* “narrative-first” in the taxonomy:**

- `calm_confidence` maps primarily to narrative + wellbeing (community mood), but is not the same construct as “official narrative credibility”.

### 6.2 `information_communication` — Information, communication, and sharing (מידע, תקשורת ושיתוף)

**What it measures:** whether messaging is **clear, credible, available, accessible**, and actually steers life-saving behavior; adapted channels; feedback loops; rumor/misinformation dynamics.

**Guiding questions (intent):** perceived effectiveness/needs-fit; sector adaptation; gaps/misinformation; accessibility for vulnerable groups; actionability vs real-world constraints.

**Primary signal types:**

- `information_clarity`, `information_confusion`, `rumor_spread`
- `active_information_seeking`
- `information_actionable_effective`, `information_effectiveness_gap`
- **New (T1/T2):** `rumor_correction`, `information_inclusivity_present` / `information_inclusivity_gap`, `feedback_loop_closure` (also touches leadership)

Many information signals also spill into **`lifesaving_behavior`** with smaller weights, reflecting the framework statement that information’s purpose is to drive protective behavior.

### 6.3 `lifesaving_behavior` — Effective life-saving behavior (התנהגות אפקטיבית להצלת חיים)

**What it measures:** preparedness + activation of mechanisms that produce **actual protective behavior** (sheltering, compliance culture, knowledge/skills, enforcement, trust in professional authority).

**Key elements enumerated in code:** threat perception; guideline clarity; knowledge/skills; enforcement; leadership-as-authority for compliance.

**Primary signal types:**

- Compliance: `compliance_enter_shelter`, `compliance_follow_instructions`, `non_compliance_*`
- Risk behaviors: `risk_exposure_behavior`, `panic_behavior`, `unsafe_gathering`
- Leadership absence also reduces lifesaving behavior slightly (`leadership_absence` mapping)

Information quality signals often affect this component because unclear/non-actionable guidance is modeled as undermining protective behavior.

### 6.4 `functional_continuity` — Functional continuity (רציפות תפקודית)

**What it measures:** maintaining essential **daily functioning** and services under emergency conditions: work/study/commerce/leisure disruption, essential goods, institutions, supply chains, “help them help themselves” continuity framing.

**Principle in code:** preserve functional, identity, and interpersonal continuity; continuity supports competence and reduces dependency.

**Primary signal types:**

- `service_continuity` / `service_disruption`
- `routine_maintenance`
- `system_overload`
- `coordination_failure` (also hits leadership/community capital)
- `resource_shortage`, `dependency_on_external_aid` (secondary pulls)
- **New (T1/T2):** `system_resilience_under_load`, `economic_continuity` / `economic_disruption`, `post_event_recovery_indicator`, `cultural_continuity`

### 6.5 `community_capital` — Community capital and resources (הון ומשאבי קהילה)

**What it measures:** mobilizing **human, physical, and network** resources; coordination; anchor organizations; volunteer activation; cross-sector cooperation.

**Primary signal types:**

- `community_volunteering`, `self_organization`, `resource_mobilization`
- `resource_shortage`, `dependency_on_external_aid` (negative)
- `coordination_failure` (negative)
- `wellbeing_support_accessed` (small positive spill; care delivery as organized response)
- **New (T1):** `local_capacity_demonstrated`, `coordination_success`, `post_event_recovery_indicator`

### 6.6 `leadership` — Leadership (מנהיגות)

**What it measures:** formal/informal leadership as **support, empowerment, trust**, representation across segments, setting example, steering behavior.

**Primary signal types:**

- `leadership_visible_presence`, `leadership_clear_guidance`
- `leadership_absence`, `coordination_failure`
- `information_confusion` (secondary negative; leadership credibility/steering)
- **New (T1/T2):** `coordination_success`, `feedback_loop_closure`

**Classifier guidance (important in practice):** the extraction prompt distinguishes “officials performing leadership communication” vs “civilian mood/narrative” vs “service continuity facts”. Those boundary rules live in `claudeEvaluator.js` and materially affect which signals appear.

### 6.7 `belonging_solidarity` — Belonging and solidarity (שייכות וסולידריות)

**What it measures:** shared fate / mutual guarantee; mutual aid; inclusion vs scapegoating; programs strengthening belonging.

**Principle in code:** “we are all in the same boat”.

**Primary signal types:**

- `solidarity_help_others`, `self_organization` (partial)
- `conflict_or_tension`, `social_isolation` (negative)

Several “helping” signals also touch `wellbeing_atrisk` because mutual aid is modeled as protective for vulnerable people, not only cohesion.

### 6.8 `wellbeing_atrisk` — Physical and mental wellbeing with emphasis on at-risk populations (דאגה לרווחה…)

**What it measures:** identifying and serving vulnerable populations; adapted physical/emotional/informational responses; monitoring/at-risk mapping.

**Principle in code:** chain strength / “weakest link”; tailored responses.

**Primary signal types:**

- `harm_to_population`, `psychological_distress`
- `wellbeing_support_accessed`
- Many negatives like `service_disruption`, `panic_behavior`, `social_isolation`, `resource_shortage` (secondary)

Note: `fear_expression` is mapped as wellbeing-negative in the weight table (distinct from narrative constructs like `resilience_narrative_*`).

---

## 7) “Closed vocabulary” signals + extraction quality controls

`behaviorSignals.js` defines:

- A **signal catalog** (`SIGNAL_CATALOG`) with domains and default polarities
- A **many-to-many mapping** (`SIGNAL_TO_COMPONENTS`)

Design goals (explicit in comments):

1. Atomic signals (one behavioral fact)
2. Closed vocabulary (no ad-hoc signal types)
3. Many-to-many mapping
4. LLM extracts, code scores (auditable)

### 7.1 Multi-pass grouped extraction (E2)

Extraction now runs **3 grouped Haiku passes per batch** instead of one mega-prompt:

- Pass A — Protective Behavior (compliance + risk)
- Pass B — Institutional Response (information + continuity + leadership)
- Pass C — Social Fabric & Wellbeing (social + narrative + resources + wellbeing)

Each pass receives the full classification rules but a focused signal vocabulary, so the model is not asked to weigh "is this leadership_clear_guidance or calm_confidence or service_continuity?" in one breath. After all passes, signals are deduplicated within the batch by `(article_index, signal_type, normalised_evidence)`.

Multipass roughly **1.8× the per-batch Haiku cost** with smaller per-pass prompts. Set `RESILIENCE_EXTRACT_MULTIPASS=0` to revert to the legacy single pass for cost-sensitive runs.

### 7.2 Closed-vocab self-check pass (E5)

After the grouped passes, a 4th cheap Haiku call sends each candidate signal back with the closed vocabulary and asks "yes / no / uncertain — is this a correct instance of its declared signal_type?". Verdicts of **no** are dropped; **uncertain** is kept (the cost of false negatives is higher than false positives at this stage).

### 7.3 Evidence-quote verifier (E1)

Every surviving signal is then run through `verifyEvidenceAgainstArticle` (a pure helper in `infrastructure/signalVerification.js`):

- Tokenises evidence and article body (Hebrew + English; punctuation stripped).
- Computes 3-gram **shingle containment** of evidence in body (`|A ∩ B| / |A|`).
- Type-specific thresholds: `direct_quote_named_person` ≥ 0.70 (with a fallback 24-token sliding window at ≥ 0.80); named survey/institutional ≥ 0.50; observational ≥ 0.40.
- Short-evidence (≤ 8 tokens) fallback: 60% token overlap accepts.
- `evidence_basis: 'inferred_absence'` bypasses verification (absence isn't quotable).

Failures are dropped with an audit log line. This eliminates the largest hallucination channel (LLM citing quotes that don't exist in the article).

### 7.4 Schema additions

Every signal now carries two extra fields:

- `extraction_confidence` (0–1, model-self-rated) — multiplies into reliability when scoring.
- `evidence_basis` (`present_in_text` | `paraphrased` | `inferred_absence`) — tells the verifier whether to expect direct overlap.

After scoring, `scoreComponents` also enriches each emitted signal copy with three underscore-prefixed fields used downstream by explainability (N9):

- `_contribution` — the signal's final post-cap contribution to this component (rounded to 3 decimals).
- `_weight` — the static `SIGNAL_TO_COMPONENTS[signal_type][component_id]` weight (signed).
- `_polarity` — `'+'` or `'-'`.

These are emitted on **copies**, not the original signal objects, so the same underlying signal can carry different `_contribution` values per component without cross-contamination. `claudeEvaluator.js` then surfaces the top-10 contributors per component as `assessment.components[].top_contributors[]` (capped to bound JSON size; UI shows top 3).

Operationally, this is what keeps the 8-component dashboard stable: the LLM's job is **labeling and quoting**, while the app's job is **routing, verification, arithmetic, and explanation**.

---

## 8) Structured municipal PBO inputs (how spreadsheets relate to the same 8 components)

Separate from free-text news, the municipality PBO path parses structured Excel columns into the same eight component IDs and computes per-component averages. Those structured scores are then converted into behavioral signals in `business_modules/pbo_report_muni/input/extract-pbo-signals.js` using a polarity split around `0.5` and the same `SIGNAL_TO_COMPONENTS` vocabulary downstream.

This is why PBO evidence shows up as `source_type: 'pbo'` in the report UI when `score_by_source` is attached.

---

## 9) Practical reading guide for officers and reviewers

When reading a component card in the app:

- Start with the **score + confidence**. Low confidence means “direction might be suggestive but evidence is thin or narrow”.
- Glance at the **"Top contributors" block** (N9) directly above the narrative — the three signals with the largest absolute contribution. This is the fastest "why is this score what it is?" check; if the top contributor is a single outlet's repeated signal, you immediately know to be skeptical of the headline.
- If the card shows an **"{n} reviewer notes" badge** next to the title (N3), reviewers have flagged this component before; click the **edit-note icon** in the open card to file your own challenge or read the existing notes via `/api/resilience/overrides?date=…`.
- Read the **narrative** as a behavioral summary constrained to the evidence payload.
- Open **evidence**:
  - Prefer the **curated evidence list** when present (short, narrative-oriented excerpts).
  - Use **source-filtered signals** when diagnosing “what drove this component today” across channels.

When interrogating a surprising score, the new diagnostic numbers in priority order:

1. **`polarization`** — high values (> 0.5 with `evidence_mass > 4`) mean positive and negative observations are split; the score is hiding a contested condition rather than measuring a direction.
2. **`source_diversity`** — a high score from one source type is more fragile than the same score from four; this is now reflected in `source_diversity_factor` and visible in the decomposition row.
3. **`signal_type_entropy`** — a component dominated by one signal type (low entropy) is more fragile than one supported by varied evidence; reflected in `type_diversity_factor`.
4. **`delta_significance`** — z-score vs the trailing 14-day distribution; `delta_flag === 'significant'` (|z|>2) is the actionable change channel.
5. **`counterfactual_delta`** — how much the score would move if the dominant article were removed; large values mean the score is leveraged off one source.

Then the older diagnostics still apply:

6. Check **which `signal_type`s** contributed (not only the narrative wording).
7. Check **`scope_level`** (single anecdote vs broad pattern vs quantified).
8. Check **`evidence_type`** (stronger institutional/survey evidence weights more).
9. Check **`distinct_article_count` vs `totalArticles`** (coverage adjustment).
10. Open **per-component facets** (when defined) — leadership/information/lifesaving each split into 3 sub-bars in the UI; a flat headline often hides a clear sub-facet drift.

---

## 10) Appendix — component IDs and UI labels

Stable IDs (used in JSON and i18n keys):

| ID | English UI label (from `client/src/i18n/translations.js`) |
|---|---|
| `narrative` | narrative |
| `information_communication` | information & communication |
| `lifesaving_behavior` | lifesaving behavior |
| `functional_continuity` | functional continuity |
| `community_capital` | community capital |
| `leadership` | leadership |
| `belonging_solidarity` | belonging & solidarity |
| `wellbeing_atrisk` | wellbeing at risk |

Hebrew UI strings are defined in parallel under the same `comp.*` keys in `translations.js`.

---

## 11) Disclaimer

This document describes **the software’s implemented model**, not a legal or clinical standard. The underlying operational framework is described in-code as aligned with Home Front Command resilience assessment methodology; local procedures and professional judgment still apply.

---

## 12) Known limitations & deferred work

These items were proposed during the v3 sensitivity/reliability redesign but require artifacts the codebase does not yet have, or were explicitly scoped out of the current bundle. They are intentionally **out of scope** for this branch and tracked here so reviewers know they are deferred, not forgotten.

> **Recently shipped (Resilience Operations Bundle):** golden eval framework with seeded corpus (now §13.1), adversarial regression suite (§13.2), reviewer override persistence (§13.3), drift dashboard (§13.4). The corresponding deferred-work entries below have been **removed** because they now have first-class implementations.

### Requires labels at human scale

- **Expand golden corpus to 80–100 hand-reviewed articles:** the seeded corpus in `tests/fixtures/resilience-golden/corpus.jsonl` is agent-curated from production extractions (30 records). It catches snapshot drift but not LLM truth-quality. Replacing the snapshot baseline with human-checked labels raises the bar from "model regression" to "extraction quality".
- **Per-outlet reliability priors:** outlet-level reputation learned from override + agreement data, replacing the current per-`source_type` reliability multiplier.

### Requires score recomputation from overrides (deferred from N3)

- **Override-aware re-scoring:** v1 of the override system (§13.3) persists challenges and shows them as a badge but does not affect the deterministic score. Adding an override-weighted re-score pass is the next iteration once enough overrides accumulate to fit a per-`signal_type` correction.

### Requires score history (collected automatically; rerun in 30 days)

- **Per-component K/m calibration (full 4c):** the values in §4.4 are author-set heuristics. Once 30+ days of `reports/resilience-report-*.json` exist, fit `K`/`m` per component to actual evidence-mass distributions.
- **Data-driven weight tuning (T5):** ridge regression with sign constraints on `SIGNAL_TO_COMPONENTS` weights against expert-labeled per-component scores.

### Requires an additional model run

- **Two-model agreement (E3):** run extraction with two different models / prompt variants and weight signals by agreement. Doubles extraction cost; deferred until quality plateau is hit on the single-model path.

---

## 13) Eval & regression (Resilience Operations Bundle)

The bundle adds four production-side guardrails. All are wired into `npm test`; nothing here requires manual operation under normal CI.

### 13.1 Golden corpus + extraction metrics (N1)

- **Corpus:** `tests/fixtures/resilience-golden/corpus.jsonl` — 30 historical articles (3 dates × 10 each) sampled from `business_modules/news-sites/articles_extracted/`, paired with **agent-curated gold signals** mined from the production `signals/signals-news-{date}.json` outputs (filtered for non-empty evidence and `extraction_confidence ≥ 0.5`).
- **Snapshot:** `tests/fixtures/resilience-golden/extraction-snapshot.jsonl` — frozen "predicted" extractions matching the gold at corpus authoring time. Replace this snapshot with real LLM rerun output to detect prompt/model drift.
- **Metrics module:** `business_modules/resilience/domain/services/extractionMetrics.js` exports:
  - `precisionRecallF1(pairs)` — per-signal_type + macro + micro, using 3-gram containment of evidence in either direction (≥ 0.4) as the per-signal match rule.
  - `cohensKappa(pairs)` — per-signal_type κ on (article × signal_type) presence/absence + macro-κ.
- **Harness:** `tests/business_modules/resilience/golden-corpus.test.js` enforces `micro_F1 ≥ 0.55` and `macro_kappa ≥ 0.40` once the corpus has at least 20 records (soft-skip below that).
- **Regenerating the corpus:** `node tests/fixtures/resilience-golden/build-corpus.mjs` (one-off generator; do NOT run in CI — it would freeze any drift).

### 13.2 Adversarial regression suite (N2)

- `tests/fixtures/resilience-adversarial/cases.json` — 13 hand-crafted scenarios + 2 LLM-only cases gated behind `RESILIENCE_LIVE_LLM=1`.
- Categories covered: rumor cascade, cross-outlet duplicated quotes, single-outlet flooding (tests N5 cap), thin-evidence min-mass floor, low-confidence chain, balanced polarization, single-source diversity-factor floor, evidence verification (true positive + false positive), within-source dedup, saturation, empty-input, thin-balanced clamp, and the two LLM-only cases (satire-as-fact + opinion-as-fact).
- `tests/business_modules/resilience/adversarial.test.js` runs each case through `dedupeSignalsWithinBatch → crossSourceDedup → scoreComponents` (or `verifyEvidenceAgainstArticle` for verification cases) and asserts bounded expectations (`score_range`, `min_polarization`, `after_cross_source_dedup_count`, `verifier_should_pass`, …). The pipeline is asserted, not the LLM — so this suite catches regressions in dedup, capping, and scoring math regardless of model behavior.

### 13.3 Reviewer override persistence (N3)

- **Backend:** `business_modules/resilience/infrastructure/overridesStore.js` (append-only JSONL at `reports/overrides/{YYYY-MM-DD}.jsonl`), `app/overridesService.js` (validation + create/list/count), `input/overridesRoutes.js` (POST + GET endpoints).
- **API:** `POST /api/resilience/overrides` (auth-gated; body: `{report_date, scope, component_id, kind, original?, proposed?, note?}`; kinds: `challenge_score | flag_signal | dispute_evidence`), `GET /api/resilience/overrides?date=YYYY-MM-DD&scope=…`.
- **`/api/report/today` extension:** the response now includes `overrides_count: { [component_id]: n }` for the report's date.
- **UI:** `OverrideBadge` shows "{n} reviewer notes" on the component title; opening the card surfaces an edit-note icon that opens `ChallengeDialog` (proposed score 1–10 + 500-char note). v1 only persists; **score recomputation from overrides is deferred** (see §12) so the blast radius is minimal.

### 13.4 Drift dashboard (N4)

- **Backend:** `business_modules/resilience/infrastructure/reportHistoryReader.js` (walks `reports/`, picks the canonical run per date — highest `total_articles_analyzed`, tie-break on mtime — for the requested scope), `app/driftService.js` (aggregates per-component series, signal-volume per day, source-type share, override rates), `input/driftRoutes.js`.
- **API:** `GET /api/resilience/drift?scope=national|north&days=30` (capped at 90 days).
- **UI:** the new **Drift** tab in `MainApp` renders 8 hand-rolled SVG sparklines (one per component, with start/end labels and per-point scoring color), a daily signal-volume bar chart, and an override-rate progress bar with totals. No charting library was added — pure SVG/MUI to keep the bundle small.

### 13.5 Where to see this in CI

`npm test` now runs ~300 tests across 95 suites; the bundle adds 5 test files (`overridesStore`, `overridesService`, `resilience-overrides.api`, `reportHistoryReader`, `driftService`, `adversarial`, `golden-corpus`, `extractionMetrics`) for ~60 new test cases. Two adversarial cases are skipped without `RESILIENCE_LIVE_LLM=1`; everything else runs hermetically.
