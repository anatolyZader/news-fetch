# 8-Component Community Resilience Analysis — Canonical Reference

**System:** Population Resilience Monitor (this app)
**Framework:** Pikud HaOref / פיקוד העורף (Home Front Command) Community Resilience Model — based on Fran Norris (2008) and Israeli Civil Defense doctrine
**Scope of this document:** the *complete* implementation reference — meaning of "community resilience" in this system, the eight components in depth, the full pipeline (data sources → ingestion → extraction → verification → deterministic scoring → reliability instruments → narration → reports → UI), the math, the operational guardrails, the QA harness, the practical reading guide for officers and reviewers, and the deferred-work backlog. Everything previously split across multiple notes is consolidated here.

It is written to match — line for line where possible — the implementation in:

- `business_modules/resilience/domain/resilienceComponents.js` (definitions + guiding questions + manifestations)
- `business_modules/resilience/domain/services/behaviorSignals.js` (signal taxonomy + deterministic scoring)
- `business_modules/resilience/domain/services/componentFacets.js` (per-component facets)
- `business_modules/resilience/domain/services/regionSignalFilter.js` (geographic scoping)
- `business_modules/resilience/infrastructure/claudeEvaluator.js` (LLM extraction + narrative synthesis constraints)
- `business_modules/resilience/infrastructure/signalVerification.js` (evidence verifier)
- `business_modules/resilience/input/{extract-signals,assess-signals}.js` (CLIs)
- `client/src/components/ReportView.jsx` (how the report is presented)

---

## Table of contents

1. [What the system measures](#1-what-the-system-measures)
2. [The 8 components — full reference](#2-the-8-components--full-reference)
3. [Architecture at a glance](#3-architecture-at-a-glance)
4. [Data sources — channels feeding the analysis](#4-data-sources--channels-feeding-the-analysis)
5. [Stage 1 — Source-specific ingestion](#5-stage-1--source-specific-ingestion)
6. [Stage 2 — Signal extraction (LLM, closed vocabulary)](#6-stage-2--signal-extraction-llm-closed-vocabulary)
7. [Stage 3 — Verification, dedup, and quality gates](#7-stage-3--verification-dedup-and-quality-gates)
8. [Stage 4 — Deterministic scoring (per component, 1–10)](#8-stage-4--deterministic-scoring-per-component-110)
9. [Stage 5 — Reliability instruments (bootstrap, counterfactual, EWMA, polarization)](#9-stage-5--reliability-instruments-bootstrap-counterfactual-ewma-polarization)
10. [Stage 6 — Narrative generation (LLM, no re-scoring)](#10-stage-6--narrative-generation-llm-no-re-scoring)
11. [Stage 7 — Report writing and UI rendering](#11-stage-7--report-writing-and-ui-rendering)
12. [Geographic scoping (national vs north)](#12-geographic-scoping-national-vs-north)
13. [Reviewer overrides and post-score adjustment](#13-reviewer-overrides-and-post-score-adjustment)
14. [Drift dashboard, alerts, and history](#14-drift-dashboard-alerts-and-history)
15. [Quality assurance (golden corpus, adversarial regression, calibration)](#15-quality-assurance-golden-corpus-adversarial-regression-calibration)
16. [Operational guardrails (cost, retries, secrets)](#16-operational-guardrails-cost-retries-secrets)
17. [End-to-end run examples](#17-end-to-end-run-examples)
18. [Practical reading guide for officers and reviewers](#18-practical-reading-guide-for-officers-and-reviewers)
19. [Known limitations and deferred work](#19-known-limitations-and-deferred-work)
20. [Appendix — component IDs and UI labels](#20-appendix--component-ids-and-ui-labels)
21. [Module / file map](#21-module--file-map)
22. [Glossary](#22-glossary)
23. [Disclaimer](#23-disclaimer)

---

## 1) What the system measures

The system produces a **daily 8-component community resilience assessment** for Israeli civilian populations under emergency conditions, with two scopes (national and *north* — the Galilee / Golan / northern border belt).

The canonical definition (verbatim intent from `business_modules/resilience/domain/resilienceComponents.js`):

> Community resilience is the community's ability, **during and after a crisis**, to leverage its resources, adapt to changes in the environment, continue to function, and provide essential community services — in order to preserve or strengthen the physical and mental health of its members.

The model is the Israeli **Home Front Command** assessment framework (Pikud HaOref), conceptually anchored in **Fran Norris (2008)**. Each of the 8 components has:

- a **definition** (what the component measures),
- **key elements / a governing principle** (where the framework names sub-factors),
- **guiding evaluation questions**, and
- **behavioral manifestations** — the observable signs the framework expects to see.

Definitions, principles, manifestations and guiding questions all live in code in `RESILIENCE_COMPONENTS` (single source of truth). All Hebrew labels, English labels, and i18n keys are derived from there.

The deliverable is, per day and per scope:

- 8 component scores on a **1–10 scale**, plus an **overall score** (certainty-weighted mean).
- For each score: a **confidence bucket** (`insufficient_data | low | medium | high`), a **bootstrap 90% CI**, a **counterfactual delta**, a **polarization** index, an **EWMA-smoothed score**, a **delta-significance** z-score, and **per-component facet sub-scores** (2–4 narrow sub-bars per component).
- An **executive synthesis** (cross-component behavioral narrative) and one **markdown narrative per component**, both grounded only in the evidence payload.
- A **signal appendix** linking every claim back to the original article URL / report identifier.

---

## 2) The 8 components — full reference

Stable IDs are used throughout JSON, code, and i18n keys.

### 2.0 At-a-glance table

| # | ID | English | Hebrew | What it measures (in one line) |
|---|---|---|---|---|
| 1 | `narrative` | Narrative | נרטיב | Public coping story; credibility of the official narrative; competing/contradictory narratives. |
| 2 | `information_communication` | Information & Communication | מידע, תקשורת ושיתוף | Clarity, credibility, accessibility, and *actionability* of public messaging; rumor / misinformation dynamics. |
| 3 | `lifesaving_behavior` | Effective Life-Saving Behavior | התנהגות אפקטיבית להצלת חיים | Whether people actually do the protective thing — sheltering, compliance, knowledge, enforcement, professional authority. |
| 4 | `functional_continuity` | Functional Continuity | רציפות תפקודית | Continuity of work, education, commerce, services; "help them help themselves." |
| 5 | `community_capital` | Community Capital & Resources | הון ומשאבי קהילה | Mobilization of human / physical / social network resources; volunteers; cross-sector cooperation. |
| 6 | `leadership` | Leadership | מנהיגות | Formal & informal leadership as support, trust, example, representation across segments. |
| 7 | `belonging_solidarity` | Belonging & Solidarity | שייכות וסולידריות | Shared fate; mutual aid; inclusion vs. scapegoating. |
| 8 | `wellbeing_atrisk` | Physical & Mental Wellbeing (At-Risk) | דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון | Identification of and adapted response to vulnerable populations (the chain is only as strong as its weakest link). |

### 2.1 Per-component facet decomposition

Each component additionally exposes **2–4 facets** (defined in `business_modules/resilience/domain/services/componentFacets.js`). Facets are scored with the same directional math (no cap, no bootstrap, to keep them cheap). They are intentionally narrow — they expose *where* inside a component the evidence is concentrated; flat headlines often hide a clear sub-facet drift.

| Component | Facets |
|---|---|
| `narrative` | `mood`, `coping_story`, `competing_narratives` |
| `information_communication` | `clarity`, `accessibility`, `actionability` |
| `lifesaving_behavior` | `compliance`, `knowledge`, `enforcement` |
| `functional_continuity` | `essential_services`, `system_load`, `economic`, `recovery` |
| `community_capital` | `mobilization`, `local_capacity`, `external_dependency` |
| `leadership` | `visibility`, `credibility`, `coordination` |
| `belonging_solidarity` | `mutual_aid`, `cohesion`, `inclusion` |
| `wellbeing_atrisk` | `physical_harm`, `psychological_distress`, `care_access` |

Every signal type listed in a facet must route into its parent component via `SIGNAL_TO_COMPONENTS` (enforced by a unit test).

---

### 2.2 `narrative` — Narrative (נרטיב)

**What it measures (per framework text):** the public story around the crisis and whether it supports or undermines coping; credibility/relevance of official narratives; coexistence of competing narratives. The framework explicitly contemplates competing frames, e.g. *"there is a purpose to the war"* vs. *"victory is not worth the price."*

**Guiding questions (verbatim intent from `RESILIENCE_COMPONENTS`):**

- Is there a dominant narrative of successful coping?
- Is the official narrative credible/relevant to the population?
- Are contradictory narratives undermining the shared story?

**Behavioral manifestations (from code):**

- A narrative of successful coping is visible and circulating (residents/officials describe coping as effective).
- The coping story reflects the entire population, not just a subset.
- Residents express that the authority's narrative is credible and reflects their lived reality.
- Competing or contradictory narratives are explicitly voiced by residents or groups.

**Primary signal types routed strongly into this component:**

- `resilience_narrative_positive` / `resilience_narrative_negative` — core narrative evidence.
- `calm_confidence` (positive) / `fear_expression` (negative spillover) — community mood.
- `rumor_spread` (negative) / `rumor_correction` (positive) — narrative/info contamination and repair.
- `harm_to_population` (small negative spillover) — harm as narrative damage beyond pure wellbeing.
- `cultural_continuity`, `post_event_recovery_indicator` — recovery/coping framing.

**Boundary rules:**

- `calm_confidence` maps to narrative + wellbeing (community mood) but is **not** the same construct as "official narrative credibility".
- Field-observer summaries or abstract labels ("overall resilience present", "strong settlement", "population coping", "community functioning") must be **rejected** as narrative signals — they get split into specific factual signal types or discarded.

---

### 2.3 `information_communication` — Information, communication, and sharing (מידע, תקשורת ושיתוף)

**What it measures:** whether messaging is **clear, credible, available, accessible**, and actually steers life-saving behavior; adapted channels; feedback loops; rumor/misinformation dynamics. When information is unavailable or not credible, rumors and misinformation fill the vacuum. The framework's stated goal is to channel the population toward effective life-saving behavior.

**Guiding questions (intent):**

- To what extent does the population perceive official information as effective and meeting their needs?
- To what extent do messaging mechanisms adapted to different community sectors exist?
- To what extent do information gaps remain, or is misinformation being spread?
- To what extent is information accessible to all population segments, including vulnerable groups?
- To what extent does the guidance match the actual situation people face — is it actionable given real constraints (workers who cannot stop, shelters not accessible, no legal framework to comply), and does it cover edge cases?

**Behavioral manifestations:** residents state they receive the information they need; communication is adapted by language/channel/format; trust in authority information; perception of national media as relevant; reports of gaps/confusion/rumors; guidance reported as actionable; guidance reported as mismatched/impractical.

**Primary signal types:**

- `information_clarity`, `information_confusion`, `rumor_spread`, `rumor_correction`.
- `active_information_seeking`.
- `information_actionable_effective`, `information_effectiveness_gap`.
- `information_inclusivity_present` / `information_inclusivity_gap`.
- `feedback_loop_closure` (also touches leadership).

Many information signals also spill into **`lifesaving_behavior`** with smaller weights, reflecting the framework statement that information's purpose is to drive protective behavior.

---

### 2.4 `lifesaving_behavior` — Effective life-saving behavior (התנהגות אפקטיבית להצלת חיים)

**What it measures:** preparedness + activation of mechanisms that produce **actual protective behavior** (sheltering, compliance culture, knowledge/skills, enforcement, trust in professional authority). Includes embedding threat awareness, building knowledge and skills, formal and community enforcement, and personal/family/community action plans.

**Key elements enumerated in code:**

- Threat perception — population perceives the event as genuinely life-threatening.
- Clarity of guidelines.
- Population knowledge and skills.
- Formal and community enforcement of protective guidelines.
- Perception of leadership as a professional authority worthy of compliance.

**Guiding questions:** does the population act according to life-saving guidelines; does it perceive the event as life-threatening; does it know and understand the guidelines; is enforcement happening; is leadership perceived as professional authority?

**Primary signal types:**

- Compliance: `compliance_enter_shelter`, `compliance_follow_instructions`, `non_compliance_exit_early`, `non_compliance_ignore_guidelines`.
- Risk behaviors: `risk_exposure_behavior`, `panic_behavior`, `unsafe_gathering`.
- Information quality (smaller weights): `information_clarity` (+), `information_confusion` (−), `information_actionable_effective` (+), `information_effectiveness_gap` (−).
- `leadership_absence` (−) — leadership absence reduces compliance via authority.

Information quality signals affect this component because unclear/non-actionable guidance is modeled as undermining protective behavior.

---

### 2.5 `functional_continuity` — Functional continuity (רציפות תפקודית)

**What it measures:** maintaining essential **daily functioning** and services under emergency conditions: work/study/commerce/leisure disruption, essential goods, institutions, supply chains, "help them help themselves."

**Principle in code:** preserve **functional, identity, and interpersonal** continuity. *Functional* = roles and tasks. *Identity* = sense of self and role. *Interpersonal* = relationships and social bonds. Maintaining continuity strengthens a sense of competence and reduces dependency. Examples: a citizen who continues working during an emergency; maintaining family roles after evacuation.

**Guiding questions:** to what extent was daily routine disrupted (work, studies, commerce, leisure)? Are essential services and goods available? Are essential workplaces and educational institutions operating? Are people able to maintain functional, identity, and social roles under emergency conditions?

**Primary signal types:**

- `service_continuity` / `service_disruption`.
- `routine_maintenance`.
- `system_overload` (−) / `system_resilience_under_load` (+).
- `economic_continuity` / `economic_disruption`.
- `post_event_recovery_indicator`, `cultural_continuity`.
- `coordination_failure` (−, also hits leadership/community capital).
- `resource_shortage`, `dependency_on_external_aid` (secondary negative pulls).

---

### 2.6 `community_capital` — Community capital and resources (הון ומשאבי קהילה)

**What it measures:** mobilizing **human, physical, and network** resources; coordination between community mechanisms; cross-sector cooperation; activation of anchor organizations (local authority, community organizations); volunteer mobilization; optimal use of comparative advantages of each partner.

**Guiding questions:** are mechanisms in place to coordinate and maximize community resources? Is there willingness to volunteer? Are anchor organizations activated and coordinating? Is cross-sector cooperation taking place?

**Primary signal types:**

- `community_volunteering`, `self_organization`, `resource_mobilization` (positive core).
- `local_capacity_demonstrated`, `coordination_success`, `post_event_recovery_indicator` (newer positive signals).
- `resource_shortage`, `dependency_on_external_aid`, `coordination_failure` (negative).
- `wellbeing_support_accessed` (small positive spillover — care delivery as organized response).

---

### 2.7 `leadership` — Leadership (מנהיגות)

**What it measures:** the perceived ability of formal and informal leadership — including religious figures, spiritual leaders, and community influencers — to lead the community, address its needs, and serve as a source of support and empowerment. Leadership can strengthen *or* weaken resilience. Key attributes: public trust, personal example, channeling public perceptions and behavior, representing all segments.

**Guiding questions:** is local leadership perceived as a source of support? Does leadership set a personal example? Does it enjoy public trust and provide a sense of security in managing the event? Does it represent and address the needs of all community segments, including marginalized groups?

**Primary signal types:**

- `leadership_visible_presence`, `leadership_clear_guidance` (positive core).
- `leadership_absence`, `coordination_failure` (negative core).
- `coordination_success`, `feedback_loop_closure` (newer positive signals).
- `information_confusion` (secondary negative — leadership credibility/steering).

**Classifier guidance (important in practice):** the extraction prompt distinguishes "officials performing leadership communication" vs. "civilian mood/narrative" vs. "service continuity facts". Those boundary rules live in `claudeEvaluator.js` and materially affect which signals appear under leadership.

---

### 2.8 `belonging_solidarity` — Belonging and solidarity (שייכות וסולידריות)

**What it measures:** creating a sense of belonging and **mutual guarantee** among community members; fostering "shared fate"; building/activating programs that strengthen belonging; encouraging mutual aid; providing responses to groups perceived as outside the community mainstream.

**Principle in code:** *"We are all in the same boat"* — a collective sense of shared destiny and mutual responsibility.

**Guiding questions:** is there solidarity, shared fate, and mutual guarantee? Is there mutual aid at the community level? Are population groups perceived as "outside the camp" or being scapegoated? Are belonging programs in place for marginalized or vulnerable groups?

**Primary signal types:**

- `solidarity_help_others`, `community_volunteering`, `self_organization` (positive).
- `wellbeing_support_accessed`, `cultural_continuity` (smaller positive spillover).
- `social_isolation`, `conflict_or_tension` (negative core).

Several "helping" signals also touch `wellbeing_atrisk` because mutual aid is modeled as protective for vulnerable people, not only cohesion.

---

### 2.9 `wellbeing_atrisk` — Physical and mental wellbeing, with emphasis on at-risk populations (דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון)

**What it measures:** the community's ability to **identify and address** the needs of vulnerable populations — in routine times and emergencies. Includes mapping vulnerability, mechanisms for identifying needs, and providing **adapted** responses (physical, emotional, informational).

**Principle in code:** the chain is only as strong as its weakest link. Responses must be tailored to the specific characteristics of vulnerable and at-risk populations (first, second, and third "circles" of vulnerability).

**Guiding questions:** is activity taking place to identify needs of vulnerable populations across the three circles of vulnerability? Are sufficient and adapted responses available at the authority level (physical, emotional, informational)? Are mechanisms in place to locate, map, and continuously monitor at-risk individuals and groups?

**Primary signal types:**

- `harm_to_population` (negative — physical harm; small positive spillover into belonging via mutual-aid response).
- `psychological_distress`, `fear_expression` (negative).
- `wellbeing_support_accessed`, `calm_confidence` (positive).
- `service_disruption`, `panic_behavior`, `social_isolation`, `resource_shortage`, `system_overload`, `economic_disruption` (secondary negatives — they all hurt at-risk populations disproportionately).
- `information_inclusivity_present` / `information_inclusivity_gap` — adapted information access.

Note: `fear_expression` is mapped as wellbeing-negative in the weight table (distinct from narrative constructs like `resilience_narrative_*`).

---

## 3) Architecture at a glance

The pipeline is intentionally split into **auditable stages** so the LLM does pattern recognition and the code does arithmetic:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ A. INGEST — channel-specific adapters / loaders                          │
│   News APIs, audio (whisper), WhatsApp exports, field reports (xlsx),    │
│   PBO municipality (xlsx), regional PBO, Naftali (xlsx), survey forms.   │
│        ↓ writes one canonical text bundle per source per date            │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ B. EXTRACT (per source) — LLM with CLOSED VOCABULARY                     │
│   `extract-signals.js --source-type X` → signals/signals-X-DATE.json     │
│   • Multipass grouped extraction (Haiku, 3 passes by domain group)       │
│   • Closed-vocab self-check pass (4th Haiku call)                        │
│   • Evidence-quote verifier (n-gram containment, Hebrew + English)       │
│   • Optional embedding rescue, optional dual-model agreement boost       │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ C. ASSESS (combined) — DETERMINISTIC SCORING                             │
│   `assess-signals.js --date Y-M-D --days N --scope national|north`       │
│   • Discovers all sources within window {date, date−1, date−2}           │
│   • Applies temporal weights (today=1.0, T-1=0.85, T-2=0.70)             │
│   • Within-source dedup, cross-source dedup                              │
│   • scoreComponents() → 1–10 per component                               │
│   • Bootstrap 90% CI, counterfactual leverage, EWMA, delta z-score       │
│   • Loads reviewer overrides; applies blend/replace if configured        │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ D. NARRATE — LLM Sonnet, NO re-scoring                                   │
│   `generateNarratives()` writes per-component markdown grounded in the   │
│   evidence payload. Scores are passed in fixed; the LLM justifies them.  │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ E. WRITE — `reports/resilience-report-DATE-HHMM.{md,json}`               │
│   Markdown for humans, JSON for the web client / drift / API.            │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ F. SERVE — REST API + React UI (`ReportView.jsx`, drift tab)             │
│   /api/report/today, /api/resilience/drift, /api/resilience/overrides    │
└──────────────────────────────────────────────────────────────────────────┘
```

**Design invariants** (enforced in the code):

1. **LLM extracts; code scores.** The LLM never assigns a 1–10. Scoring is a pure function of signals → number. The narrative LLM is told scores are already final.
2. **Closed vocabulary.** The LLM picks `signal_type` from a fixed enum (`SIGNAL_CATALOG`). Unknown types are silently dropped by the validator.
3. **Atomic signals.** One signal = one behavioral fact. Compound observations are split.
4. **Many-to-many mapping.** One signal type may push/pull multiple components with different weights and signs (`SIGNAL_TO_COMPONENTS`).
5. **Provenance everywhere.** Every signal carries source type, article source/URL, evidence text, scope level, evidence type, and (since the v3 schema) extraction confidence and evidence basis.
6. **Absence is explicit.** Reports always list manifestations with no evidence today, so thin data does not look like silent agreement.

---

## 4) Data sources — channels feeding the analysis

Six channels can feed the assessment; toggles live in `pipeline-config.json` at the repo root:

```json
{
  "sources": {
    "news":     { "enabled": true,  "description": "Homefront news articles" },
    "radio":    { "enabled": false, "description": "Radio broadcast transcripts (ashams, tzafon, kan-bet, ...)" },
    "whatsapp": { "enabled": true,  "description": "WhatsApp reports" },
    "field":    { "enabled": true,  "description": "Professional squad field visit reports" },
    "pbo":      { "enabled": true,  "description": "PBO municipality daily reports" },
    "naftali":  { "enabled": false, "description": "Naftali weekly questionnaire" }
  }
}
```

Each source produces a `signals/signals-{source}-{YYYY-MM-DD}.json` file (field signals live under `business_modules/visits/data/signals/`). `assess-signals.js` then discovers and merges these files within the requested date window.

| Source | `source_type` tag | Owner module | Native format | Conversion to text/signals | Geographic default |
|---|---|---|---|---|---|
| **News** | `news` | `business_modules/news-sites` | NewsAPI.ai JSON from Israeli outlets | `extract-homefront-articles.js` → `articles-homefront.md` (LLM Haiku pre-filter on title+snippet, cross-site dedup by title) | National (filter for *north* applies later) |
| **Radio / Audio** | `radio` | `business_modules/audio` (transcribe) → `business_modules/resilience` (extract) | mp3 / mp4 broadcasts | `audio-to-md.js` → Whisper transcription (chunked if >24 MB) → `articles-audio-{station}-{program}-{date}.md` | National |
| **WhatsApp** | `whatsapp` | `business_modules/whatsapp` | Exported group messages | `whatsapp-to-md.js` → `articles-whatsapp-{date}.md` | Treated as `north` (operator-curated channel) |
| **Field reports** | `field` | `business_modules/visits` | Hebrew expert field notes from population-behavior officer visits to northern communities (one MD bundle per visit day) | `articles-field-reports-{date}.md` (already markdown) | Always `north` |
| **PBO municipality** | `pbo` | `business_modules/pbo_report_muni` | Excel `north_<day>_4.xlsx` (structured per-component scores per municipality) | `extract-pbo-signals.js` directly emits `signals-pbo-{date}.json` (no LLM extraction — structured input is converted by polarity around 0.5) | Always `north` |
| **PBO regional** | `pbo_regional` | `business_modules/pbo_report_regional` | Excel per regional cluster (`baram`, `galma`, `golan`, `hiram`, `naftali`) | Similar conversion path | Always `north` |
| **Naftali** | `naftali` | `business_modules/naftali` | Weekly municipal questionnaire | `extract-naftali-signals.js` maps severity dimensions and free-text fields → signals | Always `north` |
| **Survey** (optional) | (varies) | `business_modules/resilience` (survey Excel + writers under `app/` / `infrastructure/adapters/`) | Municipality survey Excel | `analyze-survey.js` (one-off analysis path) | Configurable |

Two tags — `field`, `pbo`, `pbo_regional`, `naftali`, `whatsapp` — are also marked `ALWAYS_NORTH_SOURCE_TYPES` in `regionSignalFilter.js`, meaning their signals are *always* counted toward the north scope regardless of geographic terms in the evidence text. News and radio signals are scope-filtered by Hebrew/English north terminology (Galilee, Golan, Kiryat Shmona, Metula, חורפיש, מטולה, רמת הגולן, …).

### 4.1 Sample raw shape — field report (Hebrew)

The raw human input (markdown), one per visit day, looks like this (excerpt from `business_modules/visits/data/articles-field-reports-2026-03-17.md`):

```markdown
## 1. מטה אשר/איילון — ברעם (ביקור שטח)
- **Published:** 2026-03-15T12:00:00Z
- **Source:** פרופ' משה פרחי ורינת לוי

גורמים שנפגשו: יו"ר צח"י ומנהל הקהילה

חוסר אמון בפוליטיקאים ובצבא- סיפרו סיפור לא מציאותי, הבטיחו גבול שקט ובטוח -
לא קרה בפועל. שהייה רציפה במקלטים בשל היעדר ממ"דים. חקלאים — כמות מיגוניות
מצומצמים ביחס להיקף השטחים. בקשה לאספקה סדירה של מוצרי מזון. יציאה להפגה -
חשוב. חסר מקומות מוגנים לפעילות חינוכית/חברתית. הדרכות לצח"י, תגבור מתנדבים.
קשישים מקבלים מענה בקהילה. חשש מקריסת עסקים (פיצירייה). פער באנשי חינוך -
הצעה להשלמת החסר בעזרת מילואימניקים.
```

A single such paragraph routinely produces **5–15 distinct signals** spanning leadership, services, protection, wellbeing, community capital, and economic continuity. The extraction prompt explicitly instructs the LLM to walk clause by clause and split.

### 4.2 Sample structured input — PBO municipality

PBO inputs arrive as Excel sheets where every municipality already has a numeric score in [0, 1] for each of the 8 components, plus free text. `extract-pbo-signals.js` converts these directly into signals (no extraction-LLM call) by polarity-splitting around 0.5:

```js
const COMPONENT_TO_SIGNAL_TYPE = {
  narrative:                 'resilience_narrative_positive',
  information_communication: 'information_actionable_effective',
  lifesaving_behavior:       'compliance_enter_shelter',
  functional_continuity:     'service_continuity',
  community_capital:         'community_volunteering',
  leadership:                'leadership_visible_present',
  belonging_solidarity:      'solidarity_help_others',
  wellbeing_atrisk:          'wellbeing_support_accessed',
};
const COMPONENT_TO_NEG_SIGNAL = {
  narrative:                 'resilience_narrative_negative',
  /* ... */
  wellbeing_atrisk:          'psychological_distress',
};
```

Each emitted PBO signal includes `[muni name] component: avg=NN% (per-officer scores)` in `evidence`, so the PBO content type is fully traceable in the report.

---

## 5) Stage 1 — Source-specific ingestion

Each channel has its own adapter / loader, but all channels eventually produce one of two artifacts:

1. A **canonical markdown bundle** per source per date (for free-text sources): the LLM extracts signals from this in stage 2.
2. A **direct signals JSON** (for already-structured sources: `pbo`, `pbo_regional`, `naftali`).

**Symmetric recency cap (C4).** During assessment, every channel — `news`, `radio`, `whatsapp`, `field`, `pbo`, `pbo_regional`, `naftali` — is capped at the most recent 3 signal bundles inside the assessment window (`naftali` at 1 because it is weekly). Previously only the field / PBO / Naftali channels were capped; news / radio / whatsapp could pile up unconstrained. Plain symmetry: no single channel can dominate a multi-day window by accumulation alone.

### 5.1 News (`source_type: 'news'`)

`business_modules/news-sites/input/extract-homefront-articles.js` → `app/extractHomefrontArticles.js`:

- **Fetches** today's main-news articles from Israeli outlets via NewsAPI.ai. Each site has a per-outlet adapter under `infrastructure/adapters/newsApi*Adapter.js`. "Today" is computed in `Asia/Jerusalem` (`TZ_ARTICLES`).
- **LLM Haiku pre-filter** on title + short body snippet: keeps only articles plausibly carrying *population-behavior* content (not pure geopolitical/military analysis). The Hebrew keyword list at `business_modules/news-sites/domain/homefrontKeywords.js` is auxiliary and used for other tools.
- **Cross-site dedup** by first 40 meaningful chars of title (same story republished across outlets is counted once).
- **Output**: `articles-homefront.md` — a single markdown file with title, URL, publication date, source, and full body for each surviving article. Typical run: ~300–400 fetched, ~80–150 kept.

### 5.2 Radio / audio (`source_type: 'radio'`)

`business_modules/audio/input/audio-to-md.js`:

- Takes mp3/mp4 input plus `--date`, `--station`, `--program` flags.
- Transcribes via the OpenAI Whisper transcription adapter (`OpenaiTranscriptionAdapter`); files >24 MB are auto-chunked (uses `ffmpeg`/`ffprobe` if available).
- Optional `--contextualize` pass adds speaker labels and program context (`audioTranscriptContextualizer.js`).
- **Output**: `articles-audio-{station}-{program}-{date}.md`.

The signal-extraction prompt then explicitly instructs the LLM to be **highly selective on radio** — only behavioral content about civilians coping, services operating/failing, or community emergency response counts; geopolitical analysis, military appointments, political punditry, and Israeli-Palestinian commentary are explicitly off-limits.

### 5.3 WhatsApp (`source_type: 'whatsapp'`)

`business_modules/whatsapp/input/whatsapp-to-md.js`:

- Reads exported messages (configurable source) and renders them as one MD bundle per date: `articles-whatsapp-{date}.md`.
- An ingest service path also exists for live webhook intake (`webhook-routes.js` + `whatsappIngestService.js`).
- Treated as a *north* source by default.

### 5.4 Field reports (`source_type: 'field'`)

`business_modules/visits/`:

- Raw inputs are markdown bundles authored by trained resilience professionals after face-to-face visits to northern communities — `business_modules/visits/data/articles-field-reports-{date}.md`. One file per visit day, dozens of community sections per file.
- The signal-extraction prompt has a dedicated `FIELD_REPORT_SIGNAL_EXTRACTION_PREFIX` that defines the domain vocabulary (ממ"ד, מקלט, מיגונית, צח"י, כיתת כוננות, גרעין נחל, מורות חיילות, פיקוד העורף, …), the **expected scope default of `repeated_pattern`** (community-wide observation), and the strict rule to split each clause into its own signal. The scoring code enforces the same default in `contributionForSignal` (B2): when a `field` signal arrives without `scope_level`, it is treated as `repeated_pattern` rather than `single_case`. Without this, every field signal that the LLM forgot to tag was under-weighted by ~50 %.
- The visits service also exposes a dashboard (`visitsService.js` → `/api/visits/...`) summarising days, signals, and municipalities for operators.

### 5.5 PBO municipality (`source_type: 'pbo'`)

`business_modules/pbo_report_muni/`:

- Each `north_<day>_4.xlsx` carries per-municipality, per-component scores in [0, 1] plus officer notes.
- `pboMunicipalityService.js` parses sheets into a dashboard structure: `days[]` → `municipalities[]` → `components[id]` → `{ avg, scores[], texts[] }`.
- `extract-pbo-signals.js` converts each non-null `avg` into one signal — positive type if `avg ≥ 0.5`, negative type if `avg < 0.5`. Evidence concatenates municipality, component name, average, per-officer breakdown, and any free text.
- **Output**: `signals/signals-pbo-{date}.json` (no LLM extraction call).

### 5.6 PBO regional (`source_type: 'pbo_regional'`)

`business_modules/pbo_report_regional/`:

- Same shape as municipal PBO but at the regional cluster level (`baram`, `galma`, `golan`, `hiram`, `naftali`).
- Conversion is analogous; signals are tagged `source_type: 'pbo_regional'`.

### 5.7 Naftali (`source_type: 'naftali'`)

`business_modules/naftali/`:

- Weekly questionnaire Excel (`naftali_week_4.xlsx`). One signals file per week (`signals-naftali-{week-end-date}.json`).
- Mapping is dimension-driven (severity → signal type, polarity by direction): financial requests, school mental health, parental stress, couple/parent-child conflicts, vulnerability counts, plus free-text fields like volunteer initiatives, staff shortages, and main challenges.

### 5.8 Survey (one-off path)

Field survey analysis lives under **`business_modules/resilience`** (`surveyExcelLoader`, `surveyEvaluator`, `surveyReportWriter`, and `resilience/input/analyze-survey.js`) and covers a separate, ad-hoc municipality-survey analysis flow that produces its own report alongside the daily one.

---

## 6) Stage 2 — Signal extraction (LLM, closed vocabulary)

Driver: `business_modules/resilience/input/extract-signals.js`
Core logic: `business_modules/resilience/infrastructure/claudeEvaluator.js` (with `infrastructure/extractionPasses.js` for multipass and `infrastructure/signalVerification.js` for evidence checks).

### 6.1 The signal data model

Every emitted signal carries:

| Field | Description |
|---|---|
| `signal_type` | One of ~40+ closed-vocabulary types in `SIGNAL_CATALOG` (see §6.2). |
| `evidence` | A short verbatim/near-verbatim quote, observable action, or named statistic. *No journalist characterisations.* |
| `evidence_type` | `direct_quote_named_person` \| `named_survey_statistic` \| `named_institutional_fact` \| `observational_reported_fact`. Closed enum. Drives the reliability weight. |
| `scope_level` | `single_case` (0.35) \| `repeated_pattern` (0.65) \| `quantified_or_broad` (1.00). |
| `extraction_confidence` | 0–1, model-self-rated. Multiplies into reliability. |
| `evidence_basis` | `present_in_text` \| `paraphrased` \| `inferred_absence`. Tells the verifier whether to expect direct overlap. |
| `article_index`, `article_url`, `article_source` | Provenance for capping & coverage. |
| `source_type` | Tagged later by `extract-signals.js` (news/radio/field/pbo/…). |
| `temporal_weight` | Tagged later by `assess-signals.js` (today=1.0, T-1=0.85, T-2=0.70). |

After scoring, three additional underscore-prefixed fields are attached **per signal copy per component** (so the same underlying signal can carry different contributions for the multiple components it routes into):

- `_contribution` — final post-cap contribution to this component (3-decimal rounded).
- `_weight` — static `SIGNAL_TO_COMPONENTS[signal_type][component_id]` weight (signed).
- `_polarity` — `'+'` or `'-'`.

These fuel the **top contributors** explainability block (N9) shown in the UI.

### 6.2 Closed signal vocabulary

`SIGNAL_CATALOG` defines all valid `signal_type` values across 9 domains:

| Domain | Examples |
|---|---|
| **Compliance** | `compliance_enter_shelter`, `compliance_follow_instructions`, `non_compliance_exit_early`, `non_compliance_ignore_guidelines` |
| **Risk** | `risk_exposure_behavior`, `panic_behavior`, `unsafe_gathering` |
| **Social** | `solidarity_help_others`, `community_volunteering`, `social_isolation`, `conflict_or_tension` |
| **Leadership** | `leadership_visible_presence`, `leadership_clear_guidance`, `leadership_absence`, `leadership_credibility_loss`, `political_distrust`, `coordination_failure`, `coordination_success`, `feedback_loop_closure` |
| **Information** | `information_clarity`, `information_confusion`, `rumor_spread`, `rumor_correction`, `active_information_seeking`, `information_actionable_effective`, `information_effectiveness_gap`, `information_inclusivity_present`, `information_inclusivity_gap` |
| **Continuity** | `service_continuity`, `service_disruption`, `routine_maintenance`, `routine_disruption`, `evacuation_displacement`, `system_overload`, `system_resilience_under_load`, `economic_continuity`, `economic_disruption`, `post_event_recovery_indicator`, `cultural_continuity` |
| **Narrative** | `fear_expression`, `calm_confidence`, `resilience_narrative_positive`, `resilience_narrative_negative` |
| **Resources** | `resource_mobilization`, `resource_shortage`, `self_organization`, `dependency_on_external_aid`, `local_capacity_demonstrated` |
| **Wellbeing** | `harm_to_population`, `psychological_distress`, `wellbeing_support_accessed` |

Unknown `signal_type` values are silently dropped. `SIGNAL_TO_COMPONENTS` then maps each type to one or more components with a signed weight, e.g.:

```js
solidarity_help_others:    { belonging_solidarity: +1.0, wellbeing_atrisk: +0.7, community_capital: +0.6, narrative: +0.3 },
service_disruption:        { functional_continuity: -1.5, wellbeing_atrisk: -0.4 },
leadership_clear_guidance: { leadership: +1.1 },
coordination_failure:      { leadership: -1.0, community_capital: -0.6, functional_continuity: -0.5 },
fear_expression:           { wellbeing_atrisk: -0.7, narrative: -0.3 },
rumor_spread:              { information_communication: -1.2, narrative: -0.5 },
```

Negative weights make the signal *reduce* the component score; many signals also carry small "spillover" weights (e.g. `service_disruption` spills `−0.4` into `wellbeing_atrisk`, and `evacuation_displacement` spills `−0.3` into `belonging_solidarity`), enforced through `SIGNAL_TO_COMPONENTS` and tested for sign consistency. Note that **harm_to_population no longer auto-boosts `belonging_solidarity`** — the older +0.2 spillover was removed in B1 because mutual-aid response should be evidenced via `solidarity_help_others`, not inferred automatically from harm.

Four signal types added in this revision (closing a long-standing gap between the prompt and the catalog):

- **`political_distrust`** — residents or named civic figures publicly demand accountability or distrust the political handling of the emergency. Routes to `leadership` (negative), `narrative` (negative), and `information_communication` (negative).
- **`leadership_credibility_loss`** — concrete loss of trust in named leadership (broken promises, false reassurances). Routes to `leadership` (negative) and `narrative` (negative).
- **`evacuation_displacement`** — residents evacuated, displaced, or unable to return home. Routes to `functional_continuity` (negative), `wellbeing_atrisk` (negative), and `belonging_solidarity` (negative).
- **`routine_disruption`** — civilian daily routines (commuting, shopping, leisure, social rhythms) visibly disrupted. Distinct from `service_disruption` (institutional closures). Routes to `functional_continuity` (negative) and `wellbeing_atrisk` (negative).

### 6.3 Multipass grouped extraction (E2)

Instead of one mega-prompt, extraction runs **3 grouped Haiku passes per batch**, each with the full classification rules but a *focused* signal vocabulary:

- **Pass A — Protective Behavior** (compliance + risk)
- **Pass B — Institutional Response** (information + continuity + leadership)
- **Pass C — Social Fabric & Wellbeing** (social + narrative + resources + wellbeing)

This stops the model from being asked to weigh "is this `leadership_clear_guidance` or `calm_confidence` or `service_continuity`?" in a single breath. Multipass costs ~1.8× per-batch Haiku tokens with smaller per-pass prompts; set `RESILIENCE_EXTRACT_MULTIPASS=0` to revert to a single pass.

### 6.4 Closed-vocab self-check pass (E5)

After the grouped passes, a 4th cheap Haiku call sends each candidate signal back with the full closed vocabulary and asks **yes / no / uncertain — is this a correct instance of its declared `signal_type`?** Verdicts of `no` are dropped; `uncertain` is kept (false-negative cost > false-positive cost at this stage).

### 6.5 Source-specific prompts

Three prompt prefixes specialise the extraction by content kind, defined in `claudeEvaluator.js`:

- **News** — default; emphasises atomic extraction, no journalist framing, preference for verbatim quotes.
- **Radio** (`AUDIO_SIGNAL_EXTRACTION_PREFIX`) — explicit, very strict allow-list ("ONLY extract for civilians coping with the emergency, services operating or failing, community-level emergency response, emergency-caused economic hardship, psychological impact"); explicit deny-list of geopolitical analysis, military appointments, political punditry, Israeli-Palestinian commentary, criminal/accident investigations.
- **Field reports** (`FIELD_REPORT_SIGNAL_EXTRACTION_PREFIX`) — Hebrew domain-vocabulary translation table, default `scope_level: 'repeated_pattern'`, explicit instruction to split each clause/phrase into its own signal.

Whatsapp uses the news prompt (the channel typically carries operator-authored bullets resembling field-report shorthand).

### 6.6 Pre-filter for relevance (paragraph scoring)

Before sending each article body to the LLM, `extractTopKParagraphsByRelevance(body, 6)` selects the most behaviorally relevant paragraphs by counting Hebrew + English keyword hits ("מקלט", "פינוי", "shelter", "evacuee", "anxiety", "volunteer", "siren", "ממ\"ד", "אזעקה", …). This concentrates LLM tokens on paragraphs likely to carry behavioral evidence and keeps the body cap (`MAX_BODY_CHARS = 2000`) effective.

### 6.7 Optional dual-model agreement (E3)

When `RESILIENCE_SECOND_EXTRACT=1`, `resilienceAnalysisService.js` runs a *second* `extractSignals` pass (optionally with a different model, via `RESILIENCE_SECOND_EXTRACT_MODEL`). `mergeDualExtractionSignals` flags signals that survive both passes with `_dual_pass_agreement: true`, and `contributionForSignal` then multiplies their evidence by `RESILIENCE_DUAL_AGREEMENT_BOOST` (default `1.05`, clamped to `[1, 1.2]`).

---

## 7) Stage 3 — Verification, dedup, and quality gates

### 7.1 Evidence-quote verifier (E1)

Every surviving signal goes through `verifyEvidenceAgainstArticle` (pure helper in `infrastructure/signalVerification.js`):

- Tokenises evidence and article body (Hebrew + English; punctuation stripped).
- Computes 3-gram **shingle containment** of evidence in body: `|A ∩ B| / |A|`.
- Type-specific thresholds:
  - `direct_quote_named_person` ≥ 0.70, with a fallback **24-token sliding window** at ≥ 0.80 (handles short quotes embedded in long bodies).
  - `named_survey_statistic` / `named_institutional_fact` ≥ 0.50.
  - `observational_reported_fact` ≥ 0.40.
- **Short evidence (≤ 8 tokens)** falls back to a 60% token-overlap rule.
- `evidence_basis: 'inferred_absence'` bypasses verification entirely (absence is not quotable).

Failures are dropped with an audit-log line. This eliminates the largest hallucination channel — the LLM citing quotes that do not exist in the source.

### 7.2 Embedding evidence rescue (N8)

When `OPENAI_API_KEY` (or `RESILIENCE_EMBEDDING_API_KEY`) is set and `RESILIENCE_EMBEDDING_VERIFY=1` (default on with key), borderline failures from the n-gram verifier may be rescued by an OpenAI-embedding cosine similarity check. Tunables: `RESILIENCE_EMBEDDING_SIM_THRESHOLD` (default `0.82`), `RESILIENCE_EMBED_BORDERLINE_LOW`, `RESILIENCE_EMBEDDING_MODEL`. Single choke-point in `applyEvidenceVerifier` inside `claudeEvaluator.js` (NOT inside `assess-signals.js`).

### 7.3 Within-batch dedup

`dedupeSignalsWithinBatch` collapses signals identical on `(article_index, signal_type, normalised_evidence)` within a single extraction batch.

### 7.4 Within-source dedup (across day windows)

In `assess-signals.js`, when multiple bundles of the same source type are loaded (e.g. three days of field reports), signals that share `(signal_type | article_source | normalised_evidence)` are collapsed to the highest-`temporal_weight` (most recent) instance. Prevents the same field team's observation from counting once per replay day.

### 7.5 Cross-source dedup (E7)

`crossSourceDedup` (in `assessSignalsHelpers.js`) collapses the same primary quote republished by multiple outlets — so when Ynet, Maariv, and Walla all carry the same Magen David Adom statistic, the system counts one signal, not three. Without this step `coverage_ratio` would inflate purely from wire-copy republication.

The dedup key is **`source_type | signal_type | normalised_evidence`** (A4). Keying *within* `source_type` means a press quote and a field-team observation describing the same fact are no longer collapsed: the diversity layer (`source_diversity_factor` + the source-type cap) needs both channels to remain visible. Empty-evidence signals are passed through keyed by article identity so they cannot collide with substantive signals.

### 7.6 Outlet reliability priors (T-style)

`getOutletReliabilityMultiplier(article_source)` (loaded from `config/resilience-outlet-priors.json`, clamped to `[0.5, 1.5]`) is applied **only** to `observational_reported_fact` and `named_institutional_fact`. Direct quotes and named survey statistics are sourced to the speaker / instrument, so applying an outlet prior to them would be a category error. Test path overrides: `RESILIENCE_OUTLET_PRIORS_PATH`. The cache is **mtime-aware (C3)**: the priors file is `stat`-ed on each call and reloaded when the mtime advances, so long-running processes pick up edits without a restart.

---

## 8) Stage 4 — Deterministic scoring (per component, 1–10)

Driver: `scoreComponents()` in `business_modules/resilience/domain/services/behaviorSignals.js` (re-exported from `resilienceScoring.js`).

For each component `c` in the eight component IDs:

### 8.1 Per-signal contribution

For each signal `s` whose `signal_type` maps to `c` with weight `w_{s,c}` ∈ `SIGNAL_TO_COMPONENTS`:

\[
\text{contribution}(s,c) = |w_{s,c}| \times \text{scope}(s) \times \text{reliability}(s) \times \text{outletPrior}(s) \times \text{dualBoost}(s) \times \text{temporal}(s) \times \text{extraction\_confidence}(s)
\]

with:

- `scope`: `single_case` 0.35, `repeated_pattern` 0.65, `quantified_or_broad` 1.00.
- `reliability`: `direct_quote_named_person` 1.00, `named_survey_statistic` 0.95, `named_institutional_fact` 0.90, `observational_reported_fact` 0.75.
- `outletPrior`: §7.6, only for the two evidence types listed there.
- `dualBoost`: 1.05 (default) when `_dual_pass_agreement === true`.
- `temporal`: today 1.00, T-1 0.85, T-2 0.70.
- `extraction_confidence`: 0–1, clamped.

The polarity (`+` / `−`) follows `sign(w_{s,c})`.

### 8.2 Two-layer source cap (4f, N5)

To stop one channel or one outlet from dominating the polarity mass:

- **Layer 1 — source-type cap (50%).** When ≥2 `source_type`s are present, no single source type contributes more than 50% of the polarity mass. Catches "the entire positive case is press."
- **Layer 2 — article-source cap (35%).** When ≥2 distinct outlets are present, no single `article_source` (e.g. `ynet.co.il`, `maariv.co.il`) contributes more than 35% of the polarity mass. Catches *within-channel* imbalance ("press is diverse but 90% of the press case is a Ynet flood").

Both layers use the same scaling math: if a bucket exceeds its threshold, every contribution from that bucket is multiplied by `targetMass / mass`, where `targetMass = threshold · otherMass / (1 − threshold)`. For threshold=0.5 this collapses to *dominant mass = sum of other mass*. The two layers compose: source-type pass first, article-source pass second.

### 8.3 Direction, mass, strength

```
positive       = Σ contribution(s,c) for w >= 0
negative       = Σ contribution(s,c) for w  < 0
evidence_mass  = positive + negative
net_evidence   = positive − negative
strength       = tanh(net_evidence / tanhK_c)
```

`tanhK_c` is **per-component** — sparse components (`narrative`, `belonging_solidarity`) saturate earlier; dense ones (`lifesaving_behavior`) saturate later:

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

(Author-set heuristics; planned for regression recalibration once 30+ days of report history exist.)

### 8.4 Coverage and diversity adjustments

```
coverage_ratio          = distinct_article_count / total_articles
coverage_adjustment     = 0.70 + 0.30 · √coverage_ratio                        # 0.70–1.00
source_diversity_factor = 0.85 + 0.15 · min(1, (source_types − 1) / 3)         # 0.85–1.00 (saturates at 4)
type_diversity_factor   = 0.90 + 0.10 · normalised_signal_type_entropy          # 0.90–1.00
adjusted_strength       = strength · coverage_adjustment · source_diversity_factor · type_diversity_factor
```

Three independent constraints — **breadth across the corpus**, **diversity of source channels**, and **variety of signal types** — all matter, not only net direction.

### 8.5 Final score

```
score = round( clamp_{[1,10]}( 5.5 + 4.5 · adjusted_strength ) )
```

Plus a **min-mass floor**: if `evidence_mass < 1.5`, the score is clamped into `[3, 8]`. Thin single-signal evidence cannot push a score to the extremes.

`5.5` is neutral (rounded to "moderate" in UI labels). The ±4.5 range maps adjusted directional strength into 1–10.

### 8.6 Certainty and polarization

```
certainty    = 1 − exp(−evidence_mass / certM_c)   # per-component
polarization = evidence_mass > 0 ? 1 − |net|/mass : 0
```

`polarization` surfaces *contested* cases where positive and negative are roughly balanced and large — previously these collapsed to score≈5.5 indistinguishably from "no evidence". The UI shows a **"contested evidence" badge** when `polarization > 0.5 && evidence_mass > 4`.

### 8.7 Confidence bucket (UI back-compat)

Two presentations are available, both derived from the same data:

- **Bucket label** (`comp.confidence`): `low` if `certainty < 0.35` OR only one distinct article contributes; `medium` if `certainty < 0.70` OR `< 4` distinct articles; else `high`. `insufficient_data` when no signals contribute (rendered as a muted, dashed-border card so it is visually distinct from "low").
- **Numeric interval**: `7 (CI: 6–8)` shown directly under the component title using the bootstrap CI from §9.1.

### 8.8 Overall score

`overallScore` is the **certainty-weighted mean** of component scores: components with near-zero certainty do not dominate.

---

## 9) Stage 5 — Reliability instruments (bootstrap, counterfactual, EWMA, polarization)

These five numbers are computed alongside the headline score and surfaced both in JSON and in the UI:

### 9.1 Bootstrap 90% CI (`score_low`, `score_high`)

- **200 resamples-with-replacement** from per-signal contribution items (deterministic seed `0x9e3779b1`, stable across runs and tests).
- The same per-source cap and min-mass floor are applied to each resample, so the CI reflects exactly the same model the headline score uses.
- 5th / 95th percentiles of the resample distribution become `score_low` / `score_high`.
- Rendered as `7 (CI: 6–8)` in the UI and `90% CI: 6–8` in the markdown report. When the CI collapses to the headline score, only the bare score is rendered.
- **CI stability flag (B6, `ci_unstable`)**: when more than 20 % of bootstrap resamples produce no score (typical of thin / single-signal components), the function returns a widened fallback CI of `[score − 2, score + 2]` (clamped to `[1, 10]`) and sets `ci_unstable: true`. The UI annotates the row as *"CI unstable — bootstrap resamples often empty"* so reviewers don't read a coincidentally tight CI as confidence.
- **Floor-clamped flag (C7, `floor_clamped`)**: when `evidence_mass < 1.5` and the floor (`[3, 8]`) actually constrains the headline (i.e. without the floor the score would lie outside that band), the component carries `floor_clamped: true`. The UI annotates the row as *"thin evidence — score floored into [3, 8]"* and the markdown report emits an explicit thin-evidence note.

### 9.2 Counterfactual leverage (`counterfactual_article_key`, `counterfactual_delta`, C3)

- Group contribution items by `article_url || article_index`, find the article with the largest **pre-cap** `|mass|`, and recompute the score without those signals.
  - This keeps the *picked dominant article* faithful to the underlying evidence distribution (before source/outlet caps), while the recomputed score still re-applies the cap after removal — so the math remains cap-bounded (A5).
- The UI surfaces this when `|delta| ≥ 1` as: *"removing the dominant article would change this score by ±N"*.
- Direct lever for "how leveraged is this score off one source?".

### 9.3 EWMA-smoothed score (`score_smoothed`, 4e)

```
α               = 0.3 + 0.5 · certainty_today                         # 0.3–0.8
score_smoothed  = round(α · score_today + (1 − α) · score_yesterday)
```

High-certainty days move the smoothed line faster; thin-evidence days nudge it slightly. Reads up to 14 trailing days of `reports/resilience-report-*.json` for context.

**Calendar alignment (A6)**. The history series returned by `loadHistoricalScores` is now strictly **calendar-aligned**: it has length = `days` (default 14) for every known component, with `null` slots at calendar positions where the report was missing OR the component had `insufficient_data` on that day. `series[0]` therefore *always* means "yesterday" rather than "the most recent non-null prior day". When yesterday is `null`, EWMA falls back to today (no smoothing nudge) and `delta_score` is `null` — both via the `null` guards in `ewmaScore` / `enrichWithDeltaChannel`. The smoothed value is rendered in the UI as *"smoothed: N/10 (EWMA over recent days)"* whenever it differs from today's headline.

### 9.4 Delta-significance z-score (`delta_score`, `delta_significance`, `delta_flag`)

```
delta_score        = score_today − score_yesterday
delta_significance = (score_today − mean_baseline) / stddev_baseline   # baseline = non-null entries in series.slice(0, 14)
delta_flag         = 'significant' when |delta_significance| > 2
```

`delta_significance` requires at least `RESILIENCE_DELTA_MIN_HISTORY` (default 5) non-null baseline values; otherwise it returns `null`. This stops sparse components from raising spurious "significant" flags on a 2-point baseline. Chip row shows `Δ+1` / `Δ−1` adornments; significant deltas are coloured/outlined. The full delta line in the open card adds the z-score and explicitly labels significant changes. Narrative prompt rules tell the LLM to mention "a notable shift vs the 14-day baseline" for flagged components without inventing magnitude.

### 9.5 Per-component facets (T4, N6)

Each component has 2–4 facets defined in `componentFacets.js` (e.g. `leadership → { visibility, credibility, coordination }`). Each facet uses the same directional math restricted to the facet's signal subset (no cap, no bootstrap, to keep them cheap). A unit test enforces that every signal type referenced in any facet maps to its parent component via `SIGNAL_TO_COMPONENTS`.

Operationally: a flat headline often hides a clear sub-facet drift. Facets expose *where* inside a component the evidence is concentrated.

---

## 10) Stage 6 — Narrative generation (LLM, no re-scoring)

`generateNarratives()` in `claudeEvaluator.js`, model `RESILIENCE_NARRATIVE_MODEL` (default `claude-sonnet-4-6`). The narrator LLM receives:

- The **fixed scores and metadata** for all 8 components (including positive/negative mass, polarization, delta-significance, top-3 contributors, facets).
- All extracted signals bucketed by component.
- Optional **prior reports** (the previous 1–2 daily assessments) for narrative continuity.
- Optional **source-mix metadata** (which source types contributed) and an optional **`comparison_scores`** payload (when scope=north, the national scores are provided for explicit comparison).
- Optional **reviewer overrides** for the report date + scope (`challenge_score` / `dispute_evidence` — see §13).

Sonnet's only job is **labeling and quoting**. It produces, per component:

| Field | Description |
|---|---|
| `narrative` | 3–5 sentence behavioral description (what people are doing/saying — not abstract assessments). |
| `manifestations_evidenced` | Which of the component's behavioral manifestations have evidence today. |
| `manifestations_absent` | Which manifestations have no evidence today (deliberately surfaced — absence is explicit). |
| `supporting_evidence` | Up to 3 evidence quotes supporting the score. |
| `weakening_evidence` | Up to 3 evidence quotes working against the score. |

And at the top level:

| Field | Description |
|---|---|
| `cross_component_synthesis` | 2-paragraph behavioral summary across all 8 components. |
| `evidence_quality_note` | 1 sentence on the proportion of direct quotes vs reported facts today. |
| `national_comparison` | Only when scope=north: `{ overall_resilience_score, total_signals }` of the national run. |

The narrative prompt contains hard rules:

- **Do not re-score.** Scores are already final; the LLM must justify them, not change them.
- **Trace to evidence.** Every claim must trace to a signal in the payload (no journalist generalisation).
- **Mention significant shifts.** When a component carries `delta_flag === 'significant'`, the narrative must mention "a notable shift vs the 14-day baseline" without inventing magnitude.
- **Distinguish boundary cases.** Officials performing leadership communication ≠ civilian mood ≠ service continuity facts. These boundary rules live in the prompt itself.

---

## 11) Stage 7 — Report writing and UI rendering

### 11.1 Report writer

`business_modules/resilience/infrastructure/reportWriter.js` writes two files to `reports/`:

- `resilience-report-{date}-{HHMM}.md` — markdown for humans.
- `resilience-report-{date}-{HHMM}.json` — structured payload for the React client, drift dashboard, and API.

For *north* scope the prefix is `resilience-report-north-…`.

The markdown report contains:

1. Header table (date, scope, content kind, sources, articles analysed).
2. Executive summary (cross-component synthesis).
3. **Component overview table** — assessment reliability, evidence level (= certainty), evidence base (= signal count), article coverage.
4. Per-component sections — score, confidence, signal count, narrative, supporting evidence, weakening evidence, manifestations evidenced / absent, **facets** as small bars.
5. Evidence quality note.
6. **Signal appendix** — every extracted signal grouped by type, each linking to the source article URL where available.

### 11.2 Web UI

`client/src/components/ReportView.jsx` renders:

1. **Overall resilience** (`assessment.overall_resilience_score`) with the same 1–10 label bands as components (`scoreLabel10` thresholds).
2. A row of **component chips** (score + band label, with `Δ+1`/`Δ−1` adornments highlighted when significant).
3. The **executive synthesis**.
4. Eight **component cards**, each containing:
   - Title + score with bootstrap CI underneath (e.g. `7 (CI: 6–8)`).
   - **EWMA-smoothed score** annotation when `score_smoothed` differs from the headline (*"smoothed: N/10 (EWMA over recent days)"*).
   - **Thin-evidence annotation** when `floor_clamped: true` (*"thin evidence — score floored into [3, 8]"*) — a visible warning that the headline is constrained by the min-mass floor.
   - **CI-unstable annotation** when `ci_unstable: true` (*"CI unstable — bootstrap resamples often empty"*) — the displayed CI is a widened fallback rather than a tight resample distribution.
   - **Top contributors** (top-3 `_contribution`-ordered signals): the fastest "why is this score what it is?" check. Each contributor signal also carries `_contribution_raw` (pre-cap mass) alongside `_contribution` (post-cap mass) so reviewers can see *what evidence really mattered* even after the source/article cap.
   - A `{n} reviewer notes` badge when overrides exist for this component on this date (clicking the edit-note icon opens `ChallengeDialog`).
   - The **markdown narrative**.
   - **Facet bars** (2–4 per component, when defined).
   - An **evidence accordion**:
     - When `scoreBySource` is present: raw signals grouped from `score_by_source` (badges for `field`, `radio`, `naftali`, `press/news`, `pbo`).
     - Otherwise: curated evidence strings from `comp.evidence`.
5. A **Drift** tab — see §14.

### 11.3 API surface

| Endpoint | Description |
|---|---|
| `GET /api/report/today` | Latest assessment for the requested scope, plus `overrides_count: { component_id: n }` for the report date. |
| `GET /api/resilience/drift?scope=national\|north&days=30` | Time-series for sparklines + alerts (capped at 90 days). |
| `POST /api/resilience/overrides` | Auth-gated. Body: `{report_date, scope, component_id, kind, original?, proposed?, note?}`; kinds: `challenge_score | dispute_evidence`. |
| `GET /api/resilience/overrides?date=YYYY-MM-DD&scope=…` | Lists existing overrides. |
| `GET /api/visits/...` | Field-reports dashboard (days, signals, municipalities). |

---

## 12) Geographic scoping (national vs north)

`assess-signals.js --scope national|north`. The filter is applied **after** the national score is computed (so the north report can include a `national_comparison` block).

`regionSignalFilter.js`:

- **`ALWAYS_NORTH_SOURCE_TYPES`**: `field`, `pbo`, `pbo_regional`, `naftali`, `whatsapp` — these channels are always counted as north regardless of evidence text.
- **News, radio**: signals are kept for north scope only when `evidence` (or article title) matches one of dozens of north terms — Hebrew (`צפון`, `גליל`, `הגולן`, `קריית שמונה`, `מטולה`, `שלומי`, `חורפיש`, `מעלה יוסף`, …) or English (`north`, `Galilee`, `Golan`, `Kiryat Shmona`, `Metula`, `Hurfeish`, `Yirka`, `Majdal Shams`, …).

For north scope, `total_articles` becomes `max(scopedArticleCount, 1)` so the coverage ratio reflects the north corpus, not the national one.

---

## 13) Reviewer overrides and post-score adjustment

`business_modules/resilience/infrastructure/overridesStore.js` (append-only JSONL) + `app/overridesService.js` + `input/overridesRoutes.js`:

- File: `reports/overrides/{YYYY-MM-DD}.jsonl` (one challenge / dispute per line).
- **Kinds today**: `challenge_score` (live, affects displayed score) and `dispute_evidence` (offline tooling input for outlet priors / future audit). The legacy `flag_signal` kind was removed in A8 — it had no consumer in the live pipeline.
- **UI**: `OverrideBadge` shows "{n} reviewer notes" on the component title; `ChallengeDialog` writes via the API.

### 13.1 v2 display adjustment (post-score, bounded)

`generateNarratives` loads `challenge_score` overrides for the report date + scope and applies **blend** or **replace** to the headline integer shown in JSON/UI while preserving `score_deterministic` (model path).

- Env: `RESILIENCE_OVERRIDE_SCORE_MODE=blend|replace` (default `blend`).
- `RESILIENCE_OVERRIDE_BLEND_ALPHA` (default `0.85` — weight on the **model** score).
- **Multi-reviewer aggregation (A9)**: when more than one reviewer challenges the same component, the proposed scores are aggregated by **median** (rounded for even counts) rather than "latest wins". Invalid proposed scores (out of range or non-integer) are skipped, not coerced. The component carries `reviewer_proposal_count` and `reviewer_proposal_median` so the UI can show "median of N reviewers".
- `overall_resilience_score` uses the adjusted map.
- Deterministic `scoreComponents` output is unchanged; only the merged assessment payload is adjusted. Wired from `assess-signals.js` via `createOverridesService`; other callers omit `overridesService` and keep prior behavior.

### 13.2 Deferred — override-aware re-scoring

Once enough overrides accumulate to fit a per-`signal_type` correction, the next iteration adds an override-weighted re-score pass. Tracked in §19.2 below.

---

## 14) Drift dashboard, alerts, and history

`business_modules/resilience/infrastructure/reportHistoryReader.js` walks `reports/`, picks the canonical run per date (highest `total_articles_analyzed`, tie-break on mtime) for the requested scope. `app/driftService.js` aggregates and `input/driftRoutes.js` exposes:

`GET /api/resilience/drift?scope=national|north&days=30` (max 90).

Response:

- Per-component score series.
- **`signal_volume`** per day.
- **`source_type_share`** (stacked area: news / radio / field / pbo / …).
- **`override_rate`** per day.
- `daily_mean_polarization`, `daily_mean_certainty` (numeric `certainty` from JSON when present, else bucket proxy from `confidence`).
- **`alerts`** stub array:
  - `high_override_rate` when ratio exceeds `RESILIENCE_DRIFT_ALERT_OVERRIDE_RATE` (default `0.15`).
  - `high_mean_polarization` fires on a **trailing-window mean** (default 3 days; `RESILIENCE_DRIFT_POLARIZATION_WINDOW`, clamped `[1, 14]`); threshold `RESILIENCE_DRIFT_ALERT_POLARIZATION` (default `0.7`). Payload includes `polarization_window_days`.

UI (Drift tab): per-component sparklines, signal-volume bars, override-rate bar, two extra sparklines for daily mean polarization / certainty (0–1 scale), and any `alerts` rendered as MUI `Alert` rows.

---

## 15) Quality assurance (golden corpus, adversarial regression, calibration)

All hermetic; wired into `npm test`.

### 15.1 Golden corpus + extraction metrics (N1)

- **Corpus**: `tests/fixtures/resilience-golden/corpus.jsonl` — built by scanning all dates that have both `articles-homefront-{date}.md` and any `signals/{news,radio,pbo,field}-{date}.json` whose `source_files` reference that homefront MD (indices stay aligned). `build-corpus.mjs` caps per-date picks and stops at 80 rows.
- **Snapshot**: `tests/fixtures/resilience-golden/extraction-snapshot.jsonl` — frozen "predicted" extractions matching the gold at corpus-authoring time.
- **Metrics module** (`business_modules/resilience/domain/services/extractionMetrics.js`):
  - `precisionRecallF1(pairs)` — per-`signal_type` + macro + micro, using 3-gram containment of evidence in either direction (≥ 0.4) as the per-signal match rule.
  - `cohensKappa(pairs)` — per-`signal_type` κ on (article × signal_type) presence/absence + macro-κ.
- **Harness**: `tests/business_modules/resilience/golden-corpus.test.js` enforces `micro_F1 ≥ 0.55` and `macro_kappa ≥ 0.40` once the corpus has ≥ 20 records.
- **Refresh**: `RESILIENCE_REFRESH_GOLDEN=1` spawns `build-corpus.mjs` (rewrites JSONL — never enable in CI).

### 15.2 Adversarial regression suite (N2)

`tests/fixtures/resilience-adversarial/cases.json` — deterministic scenarios + 2 LLM-only cases gated behind `RESILIENCE_LIVE_LLM=1`. Categories:

- Rumor cascade.
- Cross-outlet duplicated quotes (cross-source dedup must collapse).
- Single-outlet flooding (tests N5 cap, both layers).
- Thin-evidence min-mass floor.
- Low-confidence chain.
- Balanced polarization.
- Single-source diversity-factor floor.
- Evidence verification (true positive + false positive).
- Within-source dedup.
- Saturation, empty-input, thin-balanced clamp.
- Layer-1 source_type cap (news flood + lone radio).
- Layer-2 article_source cap (Ynet flood + lone Maariv).
- Wire-copy / military-framing / headline-echo geo duplications.
- LLM-only: satire-as-fact + opinion-as-fact.

`adversarial.test.js` asserts bounded expectations (`score_range`, `min_polarization`, `after_cross_source_dedup_count`, `verifier_should_pass`, …). The pipeline is asserted, not the LLM — so this catches regressions in dedup, capping, and scoring math regardless of model behaviour.

### 15.3 Calibration

- `scripts/suggest-component-tuning.js` — scans national `reports/resilience-report-*.json`, fits per-component (`tanhK`, `certM`) by inverting the scoring math row-by-row and taking the median (B5 / Tier 7). Output is **advisory only**: `COMPONENT_TUNING` defaults stay in `behaviorSignals.js` untouched until a human edits them. Pass `--diff` to print only the components whose proposal moves by more than ±0.05 from current.
  ```bash
  node scripts/suggest-component-tuning.js              # current and proposed for every component
  node scripts/suggest-component-tuning.js --diff       # diff only (suppresses unchanged rows)
  ```
- `scripts/suggest-outlet-priors.js` — prints suggested `config/resilience-outlet-priors.json` from accumulated overrides.
- `business_modules/resilience/domain/services/signalWeightsFit.js` — `fitSignalWeightsRidgeMock()` returns `null` until labelled data exists (T5 placeholder for ridge regression with sign constraints on `SIGNAL_TO_COMPONENTS`).

### 15.4 Live-LLM CI

`.github/workflows/resilience-live-llm.yml` — `workflow_dispatch` + weekly schedule; runs `tests/business_modules/resilience/adversarial.test.js` with `RESILIENCE_LIVE_LLM=1`. Job-level secret gating uses an explicit `steps.gate.outputs.has_key` flag.

---

## 16) Operational guardrails (cost, retries, secrets)

`cross-cut-modules/budget/`:

- **Daily budget cap** via `checkDailyBudget()`. Process exits with a partial usage report if exceeded.
- **`createCostTracker({ label })`** wraps every LLM call with token + cost accounting. Rolls up into `cost-log.jsonl` at run end.
- Default per-run **cost cap**: ~$3.00. Typical news-only run: ~$0.18–0.26 (Haiku pre-filter ~$0.01; Haiku extraction ~$0.07–0.10; Sonnet narrative ~$0.10–0.15).
- **Stage instrumentation (C9)**: `applyEvidenceVerifier` and `runSelfCheck` emit per-stage stats events (`{ kept, dropped, input, reason_counts }`) into the cost tracker. `appendCostLog` aggregates them under a `stages` block in `cost-log.jsonl`, so we can later inspect per-stage kill rates without rerunning the pipeline (lets us decide whether the self-check earns its tokens).
- **`pipeline-config.json` honoured at both stages (C1)**: `extract-signals.js` now reads the same config `assess-signals.js` does and exits 0 with a log line when the requested `--source-type` is disabled. The slash-command flow stays idempotent regardless of whether sources are toggled off mid-flight.

Retry / recovery:

- Haiku batch retries: up to 3 attempts with 3/6/9s backoff.
- Sonnet retries: up to 3 attempts with 5/10/15s backoff.
- **Partial recovery**: if a Haiku batch hits `max_tokens`, complete JSON objects are salvaged via `extractJsonArray()` (regex sweep with `jsonrepair` fallback).
- Unknown `signal_type` values are dropped with a warning rather than crashing.

Required env vars:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Claude Haiku + Sonnet calls |
| `OPENAI_API_KEY` (or `RESILIENCE_EMBEDDING_API_KEY`) | Optional embedding rescue + Whisper transcription |
| `NEWSAPI_AI_KEY` (or `NEWSAPI_API_KEY`) | NewsAPI.ai authentication for news ingest |
| `TZ_ARTICLES` | Timezone for "today" (default `Asia/Jerusalem`) |
| `RESILIENCE_EXTRACT_MULTIPASS` | `0` to disable grouped multipass extraction |
| `RESILIENCE_EXTRACT_MODEL` | Override the Haiku extraction model id (default: `claude-haiku-4-5-20251001`) |
| `RESILIENCE_SELF_CHECK_MODEL` | Override the Haiku self-check model id (default: `claude-haiku-4-5-20251001`) |
| `RESILIENCE_NARRATIVE_MODEL` | Override the Sonnet narrative model id (default: `claude-sonnet-4-6`) |
| `RESILIENCE_SECOND_EXTRACT` | `1` to enable dual-model agreement boost |
| `RESILIENCE_SECOND_EXTRACT_MODEL` | Optional second extraction model id |
| `RESILIENCE_DUAL_AGREEMENT_BOOST` | Default `1.05`; clamped `[1, 1.2]` |
| `RESILIENCE_EMBEDDING_VERIFY` | `0` to disable embedding rescue |
| `RESILIENCE_EMBEDDING_SIM_THRESHOLD` | Default `0.82` |
| `RESILIENCE_OUTLET_PRIORS_PATH` | Test path override for outlet priors |
| `RESILIENCE_OVERRIDE_SCORE_MODE` | `blend` (default) or `replace` |
| `RESILIENCE_OVERRIDE_BLEND_ALPHA` | Default `0.85` (weight on model) |
| `RESILIENCE_DELTA_MIN_HISTORY` | Min non-null baseline points for delta-significance z; default `5` |
| `RESILIENCE_DRIFT_ALERT_OVERRIDE_RATE` | Default `0.15` |
| `RESILIENCE_DRIFT_ALERT_POLARIZATION` | Default `0.7` |
| `RESILIENCE_DRIFT_POLARIZATION_WINDOW` | Default `3`, clamped `[1, 14]` |
| `RESILIENCE_REFRESH_GOLDEN` | Local-only golden corpus rebuild |

---

## 17) End-to-end run examples

### 17.1 Full daily run (canonical)

```bash
# Step 0 — read pipeline-config.json (toggles)

# Step 1 — fetch today's news
npm run homefront-to-md

# Step 2 — extract news signals
node business_modules/resilience/input/extract-signals.js \
  --source-type news --files articles-homefront.md --date 2026-05-04

# Step 3 — radio (only if transcripts exist)
ls articles-audio-*2026-05-04*.md 2>/dev/null
node business_modules/resilience/input/extract-signals.js \
  --source-type radio --files articles-audio-kan-bet-2026-05-04.md --date 2026-05-04

# Step 4 — WhatsApp
node business_modules/whatsapp/input/whatsapp-to-md.js --date 2026-05-04
node business_modules/resilience/input/extract-signals.js \
  --source-type whatsapp --files articles-whatsapp-2026-05-04.md --date 2026-05-04

# Step 5 — field
node business_modules/resilience/input/extract-signals.js \
  --source-type field \
  --files business_modules/visits/data/articles-field-reports-2026-05-04.md \
  --date 2026-05-04

# Step 6 — PBO municipality (structured Excel; no LLM)
node business_modules/pbo_report_muni/input/extract-pbo-signals.js

# Step 7 — combined assessment (national)
node business_modules/resilience/input/assess-signals.js --date 2026-05-04 --days 1
```

### 17.2 North scope, 3-day window

```bash
node business_modules/resilience/input/assess-signals.js \
  --date 2026-05-04 --days 3 --scope north
```

This loads up to 3 days each of news/radio/field/pbo/pbo_regional bundles within `{2026-05-04, 2026-05-03, 2026-05-02}`, applies temporal weights `{1.0, 0.85, 0.70}`, scope-filters signals to the north (always-north source types are kept unconditionally), runs `scoreComponents`, generates the narrative with a `national_comparison` block, and writes `reports/resilience-report-north-2026-05-04-HHMM.{md,json}`.

### 17.3 Slash command (recommended)

```
/8comp
```

`.claude/commands/8comp.md` runs steps 0–7 above end-to-end; `8comp-3.md` and `8comp-3-north.md` are 3-day window variants.

---

## 18) Practical reading guide for officers and reviewers

When reading a component card in the app, work through the diagnostic stack from the strongest tier to the supporting checks.

### 18.1 Surface read

- Start with the **score + confidence band**. `low` confidence means "direction might be suggestive but evidence is thin or narrow" — not "the score is wrong".
- Glance at the **bootstrap interval** (`7 (CI: 6–8)`) directly under the title. A wide CI is the system telling you the score is sensitive to which signals happened to be sampled.
- Glance at the **delta chip** (`Δ+1` / `Δ−1`). If it is coloured/outlined, `delta_flag === 'significant'` (|z|>2 vs. the trailing 14-day distribution) — that is the actionable change channel.
- Glance at the **"contested evidence" badge**. When it appears, `polarization > 0.5 && evidence_mass > 4` — positive and negative observations are split; the score is hiding a contested condition rather than measuring a direction.

### 18.2 "Why is this score what it is?" — top contributors block

Above the narrative, the **Top contributors** block (N9) shows the three signals with the largest absolute `_contribution`. This is the fastest possible "why is this score what it is?" check.

- If the top contributor is a **single outlet's repeated signal**, you immediately know to be skeptical of the headline — the source/article cap may have already scaled it down, but the substance is still leveraged off one source.
- If the top contributors are spread across **different `source_type`s** (e.g. one news, one field, one PBO), the score is built on multi-channel agreement.
- If the top contributors all share the same `signal_type`, the picture is **direction-narrow**: high confidence in *what* is happening, but only one *kind* of behavior is showing up.

### 18.3 Reviewer notes (overrides) badge

If the card shows an **"{n} reviewer notes"** badge next to the title (N3), reviewers have flagged this component before. Click the **edit-note icon** in the open card to file your own challenge or read existing notes via `/api/resilience/overrides?date=…`. When `RESILIENCE_OVERRIDE_SCORE_MODE` is set, the headline integer in the JSON/UI may already incorporate a *blend* (default α=0.85 on model) or *replace* of those overrides — the deterministic `score_deterministic` field is preserved alongside.

### 18.4 Read the narrative

Read the **markdown narrative** as a behavioral summary constrained to the evidence payload. The Sonnet prompt explicitly forbids re-scoring, journalist-style generalisation, and inventing magnitude on flagged deltas — claims should trace back to specific signals.

### 18.5 Open the evidence accordion

- Prefer the **curated evidence list** when present (short, narrative-oriented excerpts authored by the narrative LLM under the "trace to evidence" rule).
- Use **source-filtered signals** when diagnosing "what drove this component today" across channels — the badges (`field`, `radio`, `naftali`, `press/news`, `pbo`) show the channel mix.

### 18.6 Diagnostic numbers — priority order when interrogating a surprising score

1. **`polarization`** — high values (> 0.5 with `evidence_mass > 4`) mean the score is hiding a contested condition.
2. **`source_diversity`** / `source_diversity_factor` — a high score from one source type is more fragile than the same score from four; this is reflected in the multiplier and visible in the decomposition row.
3. **`signal_type_entropy`** / `type_diversity_factor` — a component dominated by one signal type (low entropy) is more fragile than one supported by varied evidence.
4. **`delta_significance`** — z-score vs. the trailing 14-day distribution; `delta_flag === 'significant'` (|z|>2) is the actionable change channel.
5. **`counterfactual_delta`** — how much the score would move if the dominant article were removed; large values mean the score is leveraged off one source.

Then the older diagnostics still apply:

6. Check **which `signal_type`s** contributed (not only the narrative wording).
7. Check **`scope_level`** (single anecdote vs. broad pattern vs. quantified).
8. Check **`evidence_type`** (stronger institutional/survey/quote evidence weighs more).
9. Check **`distinct_article_count` vs. `total_articles`** (coverage adjustment).
10. Open the **per-component facets** — leadership/information/lifesaving/etc. each split into 2–4 sub-bars; a flat headline often hides a clear sub-facet drift.

---

## 19) Known limitations and deferred work

These items were proposed during the v3 sensitivity/reliability redesign but require artifacts the codebase does not yet have, or were explicitly scoped out of the current bundle. They are intentionally **out of scope** for this branch and tracked here so reviewers know they are deferred, not forgotten.

> **Recently shipped (Resilience Operations Bundle):** golden eval framework with seeded corpus (§15.1), adversarial regression suite (§15.2), reviewer override persistence (§13), drift dashboard (§14). The corresponding deferred-work entries below have been removed because they now have first-class implementations.

### 19.1 Requires labels at human scale

- **Expand golden corpus to 80–100 hand-reviewed articles.** The seeded corpus in `tests/fixtures/resilience-golden/corpus.jsonl` is agent-curated from production extractions (~30 records). It catches snapshot drift but not LLM truth-quality. Replacing the snapshot baseline with human-checked labels raises the bar from "model regression" to "extraction quality".
- **Per-outlet reliability priors learned from data.** Outlet-level reputation learned from override + agreement data, replacing the current author-supplied per-`source_type` reliability multiplier in `config/resilience-outlet-priors.json`.

### 19.2 Requires score recomputation from overrides

- **Override-aware re-scoring.** v1 of the override system (§13) persists challenges and shows them as a badge but does not affect the *deterministic* score (`scoreComponents` output is unchanged; only the merged assessment payload is adjusted). Adding an override-weighted re-score pass is the next iteration once enough overrides accumulate to fit a per-`signal_type` correction.

### 19.3 Requires score history (collected automatically; rerun in 30 days)

- **Per-component K/m calibration (full 4c).** The `tanhK_c` / `certM_c` values in §8.3 are author-set heuristics. Once 30+ days of `reports/resilience-report-*.json` exist, fit `K`/`m` per component to actual evidence-mass distributions.
- **Data-driven weight tuning (T5).** Ridge regression with sign constraints on `SIGNAL_TO_COMPONENTS` weights against expert-labeled per-component scores. Stub: `business_modules/resilience/domain/services/signalWeightsFit.js` (`fitSignalWeightsRidgeMock` returns `null` until labelled data exists).

### 19.4 Requires an additional model run

- **Two-model agreement at population scale (E3 full).** §6.7 ships an *opt-in* dual-pass extraction (`RESILIENCE_SECOND_EXTRACT=1`) that flags reproduced signals with `_dual_pass_agreement` and applies a small evidence boost. Doubling extraction cost in the default path is deferred until quality plateau is hit on the single-model path.

---

## 20) Appendix — component IDs and UI labels

Stable IDs (used in JSON, code, and i18n keys) and their English labels from `client/src/i18n/translations.js`:

| ID | English UI label | Hebrew UI label |
|---|---|---|
| `narrative` | narrative | נרטיב |
| `information_communication` | information & communication | מידע, תקשורת ושיתוף |
| `lifesaving_behavior` | lifesaving behavior | התנהגות אפקטיבית להצלת חיים |
| `functional_continuity` | functional continuity | רציפות תפקודית |
| `community_capital` | community capital | הון ומשאבי קהילה |
| `leadership` | leadership | מנהיגות |
| `belonging_solidarity` | belonging & solidarity | שייכות וסולידריות |
| `wellbeing_atrisk` | wellbeing at risk | דאגה לרווחה הפיזית והנפשית |

Hebrew UI strings are defined in parallel under the same `comp.*` keys in `translations.js`.

---

## 21) Module / file map

```
business_modules/
├── news-sites/                                    # Source 1 — News
│   ├── input/extract-homefront-articles.js        # CLI: fetch + LLM pre-filter → articles-homefront.md
│   ├── app/extractHomefrontArticles.js            # Orchestration
│   ├── domain/homefrontKeywords.js                # Hebrew keyword list (auxiliary)
│   ├── domain/mainNewsFilter.js                   # Main-news URL filter
│   └── infrastructure/adapters/newsApi*Adapter.js # Per-outlet NewsAPI.ai adapters
│
├── audio/                                         # Source 2 — Radio / audio
│   ├── input/audio-to-md.js                       # CLI: Whisper → articles-audio-*.md
│   ├── app/audioIngestService.js
│   ├── app/audioTranscriptContextualizer.js
│   └── infrastructure/adapters/openaiTranscriptionAdapter.js
│
├── whatsapp/                                      # Source 3 — WhatsApp
│   ├── input/whatsapp-to-md.js                    # CLI: export → articles-whatsapp-*.md
│   ├── input/webhook-routes.js                    # Live ingest
│   ├── app/whatsappIngestService.js
│   └── app/whatsappResilienceAnalyzer.js
│
├── visits/                                        # Source 4 — Field reports
│   ├── data/articles-field-reports-*.md           # Raw field-officer markdown (one per visit day)
│   ├── data/signals/signals-field-*.json          # Extracted signals
│   ├── app/visitsService.js                       # Dashboard aggregation
│   ├── domain/ports/IVisitsRepositoryPort.js
│   └── infrastructure/adapters/visitsFsAdapter.js
│
├── pbo_report_muni/                               # Source 5 — PBO municipality
│   ├── input/extract-pbo-signals.js               # Excel → signals (no LLM)
│   ├── app/pboMunicipalityService.js
│   └── app/eventLogEvaluator.js
│
├── pbo_report_regional/                           # Source 6 — PBO regional clusters
│   ├── baram/  galma/  golan/  hiram/  naftali/   # Per-cluster data
│   ├── app/  domain/  infrastructure/             # Same shape as pbo_report_muni
│
├── naftali/                                       # Source 7 — Naftali weekly questionnaire
│   ├── input/extract-naftali-signals.js           # Excel → signals
│   ├── app/naftaliService.js
│
├── resilience/                                    # The brain (+ field survey Excel → MD/JSON under app/survey*.js, input/analyze-survey.js)
    ├── domain/
    │   ├── resilienceComponents.js                # 8 component definitions, principles, manifestations
    │   ├── ports/IResilienceLlmPort.js
    │   ├── ports/IResilienceReportWriterPort.js
    │   └── services/
    │       ├── behaviorSignals.js                 # SIGNAL_CATALOG, SIGNAL_TO_COMPONENTS, scoreComponents()
    │       ├── componentFacets.js                 # Per-component facet decomposition
    │       ├── extractionMetrics.js               # P/R/F1 + Cohen's κ for golden corpus
    │       ├── outletReliabilityPriors.js         # Per-outlet reliability multiplier
    │       ├── regionSignalFilter.js              # National vs north scope filter
    │       ├── resilienceBatchValidation.js
    │       ├── resilienceScoring.js               # Re-export of scoreComponents
    │       ├── reviewerScoreAdjustments.js        # Override blend/replace logic
    │       └── signalWeightsFit.js                # T5 placeholder for ridge regression
    ├── app/
    │   ├── surveyEvaluator.js                     # Field survey — Haiku qualitative pass
    │   ├── surveyReportWriter.js                  # Field survey — MD/JSON output
    │   ├── contentBatchFromMdArticles.js
    │   ├── driftService.js                        # /api/resilience/drift aggregation
    │   ├── overridesService.js                    # Override CRUD + validation
    │   ├── resilienceAnalysisService.js           # End-to-end batch orchestration
    │   └── runResilienceAnalysis.js               # Shared news/audio orchestration
    ├── infrastructure/
    │   ├── claudeEvaluator.js                     # extractSignals + generateNarratives (Haiku + Sonnet)
    │   ├── dualModelExtract.js                    # E3 dual-pass merge + agreement boost
    │   ├── embeddingEvidenceVerifier.js           # N8 embedding rescue
    │   ├── extractionPasses.js                    # Multipass domain groups + self-check prompt
    │   ├── mdReportsLoader.js                     # Parse articles-*.md → article objects
    │   ├── overridesStore.js                      # Append-only JSONL store
    │   ├── reportHistoryReader.js                 # Walks reports/, picks canonical per-date run
    │   ├── reportWriter.js                        # Markdown + JSON output
    │   ├── signalVerification.js                  # n-gram containment + within-batch dedup
    │   └── adapters/
    │       ├── anthropicResilienceLlmAdapter.js
    │       └── surveyExcelLoader.js               # Field survey — Google Forms Excel → grouped answers
    └── input/
        ├── analyze-resilience.js                  # All-in-one: news/radio MD → report
        ├── analyze-survey.js                      # Survey path
        ├── analyzeResilienceInput.js
        ├── analyzeSurveyInput.js
        ├── assess-signals.js                      # Stage-2 CLI: combine signals + assess
        ├── assessSignalsHelpers.js                # crossSourceDedup, EWMA, delta-channel
        ├── driftRoutes.js                         # /api/resilience/drift
        ├── extract-signals.js                     # Stage-1 CLI: extract per source
        └── overridesRoutes.js                     # /api/resilience/overrides

reports/
├── resilience-report-{date}-{HHMM}.{md,json}
├── resilience-report-north-{date}-{HHMM}.{md,json}
└── overrides/{YYYY-MM-DD}.jsonl

signals/
├── signals-news-{date}.json
├── signals-radio-{date}.json
├── signals-whatsapp-{date}.json
├── signals-pbo-{date}.json
├── signals-pbo_regional-{date}.json
└── signals-naftali-{week-end-date}.json

business_modules/visits/data/signals/
└── signals-field-{date}.json

config/
└── resilience-outlet-priors.json                  # Optional per-outlet reliability prior

pipeline-config.json                                # Source enable/disable toggles

.claude/commands/
├── 8comp.md                                       # Full daily pipeline (national)
├── 8comp-3.md                                     # 3-day window
├── 8comp-3-north.md                               # 3-day window, north scope
├── analyze-news.md  / analyze-news-full-3.md
├── analyze-radio.md / analyze-radio-full-3.md
├── analyze-field.md / analyze-field-full-3.md
└── radio-transcribe.md / radio-transcribe-3.md

tests/
├── fixtures/
│   ├── resilience-golden/{corpus,extraction-snapshot}.jsonl + build-corpus.mjs
│   └── resilience-adversarial/cases.json
└── business_modules/resilience/{golden-corpus,adversarial,…}.test.js
```

---

## 22) Glossary

- **Pikud HaOref / פיקוד העורף** — Israeli Home Front Command; civil-defence authority whose community-resilience assessment methodology this app implements.
- **Norris (2008)** — *Community Resilience as a Metaphor, Theory, Set of Capacities, and Strategy for Disaster Readiness* (Norris, Stevens, Pfefferbaum, Wyche & Pfefferbaum, 2008). The conceptual anchor underneath the Pikud HaOref operational model.
- **ממ"ד (mamad)** — individual safe room (in-home shelter).
- **מקלט (miklat)** — public shelter.
- **מיגונית** — armoured field protection booth (typically for farmers in open fields).
- **צח"י** — Tzevet Cherum Yishuvi — community emergency volunteer corps under Home Front Command.
- **כיתת כוננות** — community readiness unit (armed first-response squad).
- **גרעין נח"ל / מורות חיילות** — army education-core / soldier-teachers embedded in communities.
- **שחיקה** — burnout / cumulative erosion.
- **הפגה** — relief / decompression activity.
- **PBO (Population Behaviour Officer)** — trained civil-defence professional whose municipality and field reports feed the `pbo` and `field` channels.
- **Atomic signal** — one verb, one behavioural fact. Compound observations are split.
- **Closed vocabulary** — fixed enum of `signal_type` values; the LLM cannot invent types.
- **Many-to-many mapping** — one signal may push or pull several components, with signed weights.
- **Adjusted strength** — `tanh(net/tanhK_c) · coverage_adj · source_div_f · type_div_f`. Maps directional evidence to `[-1, 1]` after diversity penalties.
- **Min-mass floor** — when `evidence_mass < 1.5`, the rounded score is clamped into `[3, 8]`. Prevents thin single-signal evidence from reaching the extremes.
- **`floor_clamped`** — boolean flag emitted on a component whenever the min-mass floor actually constrained the headline (the unconstrained score would have lain outside `[3, 8]`). Surfaced in the UI as *"thin evidence"*.
- **`ci_unstable`** — boolean flag emitted on a component when more than 20 % of bootstrap resamples yielded no score; CI then becomes a widened fallback `[score − 2, score + 2]` clamped to `[1, 10]`.
- **Source-type cap (Layer 1)** — 50% threshold preventing one channel (e.g. news) from dominating polarity mass.
- **Article-source cap (Layer 2)** — 35% threshold preventing one outlet (e.g. Ynet) from dominating polarity mass *within* the press channel.
- **`_contribution` vs `_contribution_raw`** — every emitted signal carries both. `_contribution` is the post-cap mass actually used by the score; `_contribution_raw` is the pre-cap mass, exposed so the UI can rank "what evidence really mattered" while the math stays cap-bounded.
- **Polarization** — `1 − |net|/mass`. Surfaces contested cases where positive and negative are roughly balanced and large.
- **EWMA-smoothed score** — `α · today + (1 − α) · yesterday`, with `α = 0.3 + 0.5 · certainty_today`. Yesterday is read from the calendar-aligned history; when missing, EWMA falls back to today.
- **Delta significance** — `(score_today − mean_baseline) / stddev_baseline` over the calendar-aligned baseline; requires at least `RESILIENCE_DELTA_MIN_HISTORY` (default 5) non-null prior days. `|z| > 2` is flagged in the UI.
- **Counterfactual leverage** — score change after removing the article that contributes the most pre-cap `|mass|` to a component.
- **Evidence basis** — one of `present_in_text` (verifier expects direct overlap), `paraphrased`, or `inferred_absence` (verifier bypassed).
- **`_dual_pass_agreement`** — flag set when a signal is reproduced by both extraction passes; multiplies evidence by `dualBoost ∈ [1, 1.2]`.
- **`political_distrust` / `leadership_credibility_loss`** — leadership-domain negative signal types (added in this revision). The first is about named accountability demands or distrust of the political handling of the emergency; the second is about concrete loss of trust in named leadership (broken promises, false reassurances).
- **`evacuation_displacement`** — continuity-domain negative signal type for residents evacuated, displaced, or unable to return home; spills into `wellbeing_atrisk` and `belonging_solidarity`.
- **`routine_disruption`** — continuity-domain negative signal type for civilian daily-routine disruption (commuting, shopping, leisure, social rhythms). Distinct from `service_disruption` (institutions) and `economic_disruption` (employment / business).

---

## 23) Disclaimer

This document describes **the software's implemented model**, not a legal or clinical standard. The underlying operational framework is described in-code as aligned with Home Front Command resilience assessment methodology; local procedures and professional judgment still apply.
