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

### 4.3 Coverage adjustment (penalize “one article says everything”)

Let `distinctArticleCount` be the number of distinct articles referenced by contributing signals (via `article_url` or `article_index`), and `totalArticles` the batch size passed into scoring.

- `coverage_ratio = distinctArticleCount / totalArticles` (0 if `totalArticles` is 0)
- `coverage_adjustment = 0.70 + 0.30 * sqrt(coverage_ratio)` (ranges ~0.70–1.00)
- `adjusted_strength = strength * coverage_adjustment`

This is the app’s way of encoding: **breadth across the corpus matters**, not only net direction.

### 4.4 Certainty and the final 1–10 score

- `certainty = 1 - exp(-evidence_mass / m)` with `m = 2.0` (asymptotic toward 1 as evidence mass grows)

Final score:

\[
\text{score}=\text{round}\big(\text{clamp}_{[1,10]}(5.5 + 4.5 \times \text{adjusted\_strength})\big)
\]

Interpretation:

- **5.5 is neutral** (maps to “moderate” band in UI labeling when rounded to whole numbers).
- The **±4.5** range maps the adjusted directional strength into the 1–10 scale.

### 4.5 Confidence labels shown in the UI

If a component has **no mapped signals**, it is `insufficient_data` with `score: null`.

Otherwise confidence is derived from certainty + article breadth heuristics:

- `low` if `certainty < 0.35` **or** only one distinct article contributes
- `medium` if `certainty < 0.70` **or** fewer than 4 distinct articles
- else `high`

These strings are displayed via `t('confidence.*')` in `ReportView.jsx`.

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

### 6.5 `community_capital` — Community capital and resources (הון ומשאבי קהילה)

**What it measures:** mobilizing **human, physical, and network** resources; coordination; anchor organizations; volunteer activation; cross-sector cooperation.

**Primary signal types:**

- `community_volunteering`, `self_organization`, `resource_mobilization`
- `resource_shortage`, `dependency_on_external_aid` (negative)
- `coordination_failure` (negative)
- `wellbeing_support_accessed` (small positive spill; care delivery as organized response)

### 6.6 `leadership` — Leadership (מנהיגות)

**What it measures:** formal/informal leadership as **support, empowerment, trust**, representation across segments, setting example, steering behavior.

**Primary signal types:**

- `leadership_visible_presence`, `leadership_clear_guidance`
- `leadership_absence`, `coordination_failure`
- `information_confusion` (secondary negative; leadership credibility/steering)

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

## 7) “Closed vocabulary” signals: why this matters for analysis quality

`behaviorSignals.js` defines:

- A **signal catalog** (`SIGNAL_CATALOG`) with domains and default polarities
- A **many-to-many mapping** (`SIGNAL_TO_COMPONENTS`)

Design goals (explicit in comments):

1. Atomic signals (one behavioral fact)
2. Closed vocabulary (no ad-hoc signal types)
3. Many-to-many mapping
4. LLM extracts, code scores (auditable)

Operationally, this is what keeps the 8-component dashboard stable: the LLM’s job is **labeling and quoting**, while the app’s job is **routing and arithmetic**.

---

## 8) Structured municipal PBO inputs (how spreadsheets relate to the same 8 components)

Separate from free-text news, the municipality PBO path parses structured Excel columns into the same eight component IDs and computes per-component averages. Those structured scores are then converted into behavioral signals in `business_modules/pbo_report_muni/input/extract-pbo-signals.js` using a polarity split around `0.5` and the same `SIGNAL_TO_COMPONENTS` vocabulary downstream.

This is why PBO evidence shows up as `source_type: 'pbo'` in the report UI when `score_by_source` is attached.

---

## 9) Practical reading guide for officers and reviewers

When reading a component card in the app:

- Start with the **score + confidence**. Low confidence means “direction might be suggestive but evidence is thin or narrow”.
- Read the **narrative** as a behavioral summary constrained to the evidence payload.
- Open **evidence**:
  - Prefer the **curated evidence list** when present (short, narrative-oriented excerpts).
  - Use **source-filtered signals** when diagnosing “what drove this component today” across channels.

When interrogating a surprising score:

1. Check **which `signal_type`s** contributed (not only the narrative wording).
2. Check **`scope_level`** (single anecdote vs broad pattern vs quantified).
3. Check **`evidence_type`** (stronger institutional/survey evidence weights more).
4. Check **`distinct_article_count` vs `totalArticles`** (coverage adjustment).

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
