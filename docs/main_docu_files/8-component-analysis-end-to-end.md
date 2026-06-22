# 8-Component Community Resilience Analysis — Canonical Reference

**Location:** `docs/main_docu_files/` (canonical main documentation; auto-synced sections — see [README](./README.md))

**System:** Population Resilience Monitor (this app)
**Framework:** Pikud HaOref / פיקוד העורף (Home Front Command) Community Resilience Model — based on Fran Norris (2008) and Israeli Civil Defense doctrine
**Scope of this document:** the *complete* implementation reference — meaning of "community resilience" in this system, the eight components in depth, the full pipeline (data sources → ingestion → extraction → verification → deterministic scoring → reliability instruments → narration → reports → UI), the math, the operational guardrails, the QA harness, the practical reading guide for officers and reviewers, and the deferred-work backlog. Everything previously split across multiple notes is consolidated here.

**Last updated:** 2026-05-30

It is written to match — line for line where possible — the implementation in:

- `business_modules/resilience/domain/resilienceComponents.js` (definitions + guiding questions + manifestations)
- `business_modules/resilience/domain/services/behaviorSignals.js` (signal taxonomy + deterministic scoring)
- `business_modules/resilience/domain/services/componentFacets.js` (per-component facets)
- `business_modules/resilience/domain/services/regionSignalFilter.js` (geographic scoping)
- `business_modules/resilience/infrastructure/claudeExtraction.js` + `claudeNarratives.js` (barrel: `claudeEvaluator.js`)
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
12. [Geographic scoping (national + regional districts)](#12-geographic-scoping-national--five-regional-districts)
13. [Reviewer overrides (removed in phase 1)](#13-reviewer-overrides-removed-in-phase-1)
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

<!-- docs-sync:BEGIN components-at-a-glance -->

> **Auto-synced** from `business_modules/resilience/domain/resilienceComponents.js` on 2026-06-22. Do not edit between sync markers.

| # | ID | English | Hebrew | What it measures (in one line) |
|---|---|---|---|---|
| 1 | `narrative` | Narrative | נרטיב | The ability of the public story surrounding the crisis to influence coping. |
| 2 | `information_communication` | Information, Communication, and Sharing | מידע, תקשורת ושיתוף | The ability of information and public messaging to guide life-saving behavior, and to be clear, credible, available, and accessible to all population segments. |
| 3 | `lifesaving_behavior` | Effective Life-Saving Behavior | התנהגות אפקטיבית להצלת חיים | The ability to prepare community mechanisms in routine times and activate them during emergencies to ensure effective life-saving behavior. |
| 4 | `functional_continuity` | Functional Continuity | רציפות תפקודית | The ability of the community to continue functioning and providing essential personal and community services and needs according to the situation's characteristics. |
| 5 | `community_capital` | Community Capital and Resources | הון ומשאבי קהילה | The ability to maximize community resources — human, physical, and social networks — through coordination between community mechanisms, cross-sector cooperation, activation of anchor organizations (local authority, community organizations), and volunteer mobilization. |
| 6 | `leadership` | Leadership | מנהיגות | The perceived ability of formal and informal leadership — including religious figures, spiritual leaders, and community influencers — to lead the community, address its needs, and serve as a source of support and empowerment. |
| 7 | `belonging_solidarity` | Belonging and Solidarity | שייכות וסולידריות | The ability to create a sense of belonging and mutual guarantee among community members. |
| 8 | `wellbeing_at_risk` | Physical and Mental Wellbeing (At-Risk Populations) | דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון | The ability of the community to identify and address the needs of vulnerable populations — in routine times and during emergencies. |

<!-- docs-sync:END components-at-a-glance -->

### 2.1 Per-component facet decomposition

Each component additionally exposes **2–4 facets** (defined in `business_modules/resilience/domain/services/componentFacets.js`). Facets are scored with the same directional math (no cap, no bootstrap, to keep them cheap). They are intentionally narrow — they expose *where* inside a component the evidence is concentrated; flat headlines often hide a clear sub-facet drift.

<!-- docs-sync:BEGIN component-facets -->

> **Auto-synced** from `business_modules/resilience/domain/services/componentFacets.js` on 2026-06-22. Do not edit between sync markers.

| Component | Facets |
|---|---|
| `narrative` | `mood`, `coping_story`, `competing_narratives`, `framing` |
| `information_communication` | `clarity`, `trust`, `accessibility`, `actionability`, `influence`, `overload_vacuum`, `early_warning` |
| `lifesaving_behavior` | `compliance`, `knowledge`, `enforcement`, `preparedness` |
| `functional_continuity` | `essential_services`, `system_load`, `economic`, `recovery`, `displacement`, `education`, `adaptation`, `supply_food`, `displacement_extended` |
| `community_capital` | `mobilization`, `local_capacity`, `external_dependency`, `collective_action`, `allocation` |
| `leadership` | `visibility`, `credibility`, `competence`, `coordination`, `civic`, `trust` |
| `belonging_solidarity` | `mutual_aid`, `cohesion`, `inclusion`, `exclusion`, `bridging` |
| `wellbeing_at_risk` | `physical_harm`, `psychological_distress`, `affect_balance`, `care_access`, `equity`, `household_strain`, `population_evidence`, `sensitive_harm`, `hostage` |

<!-- docs-sync:END component-facets -->

Every signal type listed in a facet must route into its parent component via `SIGNAL_TO_COMPONENTS` (enforced by a unit test).

<!-- docs-sync:BEGIN components-detail -->

> **Auto-synced** from `resilienceComponents.js + componentFacets.js` on 2026-06-22. Do not edit between sync markers.


Per-component reference below is regenerated from code. Extended narrative, signal-routing notes, and boundary rules in earlier manual sections may appear in pipeline stages §3+.

### 2.2 `narrative` — Narrative (נרטיב)

**What it measures:** The ability of the public story surrounding the crisis to influence coping. A dominant narrative can strengthen or weaken the community's ability to endure. The official narrative must be perceived as credible and relevant. Multiple narratives may coexist — complementary or conflicting. Examples of competing frames: "there is a purpose to the war" vs. "victory is not worth the price."

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent is there a dominant narrative of successful coping?
- To what extent is the official narrative perceived as credible and relevant by the population?
- To what extent are there contradictory or competing narratives undermining the shared story?

**Behavioral manifestations (from code):**
- A narrative of successful coping is visible and circulating (residents/officials describe coping as effective)
- The coping story reflects the entire population, not just a subset
- Residents express that the authority's narrative is credible and reflects their lived reality
- Competing or contradictory narratives are explicitly voiced by residents or groups

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `mood` | `fear_expression`, `calm_confidence` |
| `coping_story` | `resilience_narrative_positive`, `resilience_narrative_negative`, `post_event_recovery_indicator`, `future_orientation_hope`, `future_orientation_despair` |
| `competing_narratives` | `rumor_spread`, `rumor_correction`, `harm_to_population`, `cultural_continuity`, `hostile_influence_operation`, `deepfake_misinformation` |
| `framing` | `blame_narrative`, `heroism_overframing`, `historical_analogy_frame`, `moral_injury_narrative`, `institutional_abandonment_perception` |

**All facet signal types for this component:** `blame_narrative`, `calm_confidence`, `cultural_continuity`, `deepfake_misinformation`, `fear_expression`, `future_orientation_despair`, `future_orientation_hope`, `harm_to_population`, `heroism_overframing`, `historical_analogy_frame`, `hostile_influence_operation`, `institutional_abandonment_perception`, `moral_injury_narrative`, `post_event_recovery_indicator`, `resilience_narrative_negative`, `resilience_narrative_positive`, `rumor_correction`, `rumor_spread`

---

### 2.3 `information_communication` — Information, Communication, and Sharing (מידע, תקשורת ושיתוף)

**What it measures:** The ability of information and public messaging to guide life-saving behavior, and to be clear, credible, available, and accessible to all population segments. Includes adapted messaging for different sectors and feedback mechanisms. When information is unavailable or not credible, rumors and misinformation fill the vacuum. The goal is to channel the population toward effective life-saving behavior.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent does the population perceive official information — guidance, instructions, and support — as effective and meeting their needs?
- To what extent do information and messaging mechanisms adapted to different community sectors exist?
- To what extent do information gaps remain, or is misinformation (fake news) being spread?
- To what extent is information accessible and available to all population segments, including vulnerable groups?
- To what extent does the guidance match the actual situation people face — is it actionable given real constraints (workers who cannot stop, shelters not accessible, no legal framework to comply), and does it cover edge cases (mass casualties, no nearby shelter, economic decisions under fire)?

**Behavioral manifestations (from code):**
- Residents state they receive the information they need to function during the emergency
- Authority communication mechanisms are adapted to different resident groups (language, channel, format)
- Residents express trust in information received from the authority
- Population perceives national media information as relevant and addressing their needs
- Residents report information gaps, confusion, or spread of rumors/misinformation
- Guidance is reported as situation-matched and actionable — residents could follow it given real-world constraints
- Guidance is reported as mismatched, impractical, or failing to cover critical scenarios (workers with no legal protection to stop, no shelter access, mass-casualty situations)

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `clarity` | `information_clarity`, `information_confusion`, `rumor_spread`, `rumor_correction` |
| `trust` | `trusted_information_source`, `mistrusted_information_source`, `feedback_channel_open`, `feedback_channel_blocked`, `media_trust` |
| `accessibility` | `information_inclusivity_present`, `information_inclusivity_gap`, `active_information_seeking`, `language_register_mismatch` |
| `actionability` | `information_actionable_effective`, `information_effectiveness_gap` |
| `influence` | `hostile_influence_operation`, `rumor_spread`, `news_avoidance_behavior`, `media_literacy_demonstrated`, `deepfake_misinformation` |
| `overload_vacuum` | `information_overload`, `information_vacuum_post_event`, `meta_information_present`, `meta_information_gap` |
| `early_warning` | `early_warning_system_effective`, `early_warning_system_failure` |

**All facet signal types for this component:** `active_information_seeking`, `deepfake_misinformation`, `early_warning_system_effective`, `early_warning_system_failure`, `feedback_channel_blocked`, `feedback_channel_open`, `hostile_influence_operation`, `information_actionable_effective`, `information_clarity`, `information_confusion`, `information_effectiveness_gap`, `information_inclusivity_gap`, `information_inclusivity_present`, `information_overload`, `information_vacuum_post_event`, `language_register_mismatch`, `media_literacy_demonstrated`, `media_trust`, `meta_information_gap`, `meta_information_present`, `mistrusted_information_source`, `news_avoidance_behavior`, `rumor_correction`, `rumor_spread`, `trusted_information_source`

---

### 2.4 `lifesaving_behavior` — Effective Life-Saving Behavior (התנהגות אפקטיבית להצלת חיים)

**What it measures:** The ability to prepare community mechanisms in routine times and activate them during emergencies to ensure effective life-saving behavior. Includes embedding threat awareness, building knowledge and skills, formal and community enforcement of protective guidelines, and planning and activating personal, family, and community action plans. Also includes embedding a culture of personal and community preparedness.

**Key elements:**
- Threat perception — the population perceives the event as genuinely life-threatening
- Clarity of guidelines — instructions are clear and understood
- Population knowledge and skills — ability to act correctly at both individual and community levels
- Formal and community enforcement of protective guidelines
- Perception of leadership as a professional authority worthy of compliance

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent does the population act according to life-saving guidelines?
- To what extent does the population perceive the event as life-threatening?
- To what extent does the population know and understand the published guidelines?
- To what extent does formal or community enforcement of protective guidelines take place?
- To what extent is leadership perceived as a professional authority that guides protective behavior?

**Behavioral manifestations (from code):**
- Residents are observed or reported to actually follow Home Front Command (HFC) protective guidelines (sheltering, evacuating, etc.)
- Residents demonstrate knowledge and understanding of HFC guidelines
- Community teams or roles actively promote emergency preparedness among residents
- Residents or officials report non-compliance with protective guidelines
- Residents express or demonstrate perception of the situation as genuinely life-threatening

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `compliance` | `compliance_enter_shelter`, `compliance_follow_instructions`, `compliance_partial`, `non_compliance_exit_early`, `non_compliance_ignore_guidelines`, `non_compliance_due_to_distrust`, `compliance_norm_enforcement`, `complacency_or_normalization` |
| `knowledge` | `information_actionable_effective`, `information_effectiveness_gap`, `information_clarity`, `leadership_clear_guidance`, `protection_effective`, `near_miss_reported` |
| `enforcement` | `risk_exposure_behavior`, `risk_trade_off_behavior`, `unsafe_gathering`, `panic_behavior` |
| `preparedness` | `preparedness_drill_conducted`, `preparedness_gap_identified`, `protective_infrastructure_present`, `protective_infrastructure_absent`, `household_readiness_demonstrated`, `household_readiness_gap`, `plan_tested_during_event`, `plan_failed_during_event`, `responder_workforce_strain`, `early_warning_system_effective`, `early_warning_system_failure` |

**All facet signal types for this component:** `complacency_or_normalization`, `compliance_enter_shelter`, `compliance_follow_instructions`, `compliance_norm_enforcement`, `compliance_partial`, `early_warning_system_effective`, `early_warning_system_failure`, `household_readiness_demonstrated`, `household_readiness_gap`, `information_actionable_effective`, `information_clarity`, `information_effectiveness_gap`, `leadership_clear_guidance`, `near_miss_reported`, `non_compliance_due_to_distrust`, `non_compliance_exit_early`, `non_compliance_ignore_guidelines`, `panic_behavior`, `plan_failed_during_event`, `plan_tested_during_event`, `preparedness_drill_conducted`, `preparedness_gap_identified`, `protection_effective`, `protective_infrastructure_absent`, `protective_infrastructure_present`, `responder_workforce_strain`, `risk_exposure_behavior`, `risk_trade_off_behavior`, `unsafe_gathering`

---

### 2.5 `functional_continuity` — Functional Continuity (רציפות תפקודית)

**What it measures:** The ability of the community to continue functioning and providing essential personal and community services and needs according to the situation's characteristics. Includes supply of essential goods and services, operation of essential workplaces and educational institutions, and minimization of damage to daily routine. The aspiration is to restore or preserve continuity as much as possible.

**Principle:** In a disaster, three forms of continuity must be preserved or restored: functional continuity (roles and tasks), identity continuity (sense of self and role), and interpersonal continuity (relationships and social bonds). Maintaining continuity strengthens a sense of competence and reduces dependency. The guiding principle is: "help them help themselves." Examples: a citizen who continues working during an emergency; maintaining family roles after evacuation.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent was daily routine disrupted in the following areas: work, studies, commerce, leisure activities?
- To what extent are essential services and goods available to the population?
- To what extent are essential workplaces and educational institutions continuing to operate?
- To what extent are people able to maintain their functional, identity, and social roles under emergency conditions?

**Behavioral manifestations (from code):**
- Residents succeed in managing daily life (reported continuation of work, commerce, or social roles)
- Schools and educational institutions are open and operating (or explicitly closed/disrupted)
- Residents report that sufficient resources are available to maintain routine functioning
- Essential services (healthcare, supply chains, municipal services) continue to operate
- Specific disruptions to daily life are reported (closures, evacuations, inability to work)

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `essential_services` | `service_continuity`, `service_disruption`, `routine_maintenance`, `routine_disruption` |
| `system_load` | `system_overload`, `system_resilience_under_load` |
| `economic` | `economic_continuity`, `economic_disruption`, `workplace_flexibility_response` |
| `recovery` | `post_event_recovery_indicator`, `cultural_continuity`, `recovery_setback`, `compensation_received`, `compensation_blocked`, `displacement_resolved` |
| `displacement` | `evacuation_displacement`, `displacement_resolved` |
| `education` | `educational_continuity`, `educational_disruption`, `learning_loss_documented`, `educational_equity_gap` |
| `adaptation` | `adaptive_practice`, `lessons_learned_uptake`, `innovation_under_constraint`, `failure_to_adapt`, `cross_event_learning` |
| `supply_food` | `supply_chain_disruption`, `food_security_stress`, `food_security_maintained`, `infrastructure_damage_acute`, `connectivity_outage` |
| `displacement_extended` | `evacuation_displacement`, `displacement_resolved`, `self_evacuation_unauthorized` |

**All facet signal types for this component:** `adaptive_practice`, `compensation_blocked`, `compensation_received`, `connectivity_outage`, `cross_event_learning`, `cultural_continuity`, `displacement_resolved`, `economic_continuity`, `economic_disruption`, `educational_continuity`, `educational_disruption`, `educational_equity_gap`, `evacuation_displacement`, `failure_to_adapt`, `food_security_maintained`, `food_security_stress`, `infrastructure_damage_acute`, `innovation_under_constraint`, `learning_loss_documented`, `lessons_learned_uptake`, `post_event_recovery_indicator`, `recovery_setback`, `routine_disruption`, `routine_maintenance`, `self_evacuation_unauthorized`, `service_continuity`, `service_disruption`, `supply_chain_disruption`, `system_overload`, `system_resilience_under_load`, `workplace_flexibility_response`

---

### 2.6 `community_capital` — Community Capital and Resources (הון ומשאבי קהילה)

**What it measures:** The ability to maximize community resources — human, physical, and social networks — through coordination between community mechanisms, cross-sector cooperation, activation of anchor organizations (local authority, community organizations), and volunteer mobilization. Optimal use of the comparative advantages of each partner.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent do mechanisms exist for effective coordination and maximization of community resources (human, physical, network)?
- To what extent is there willingness among the population for active volunteer action for their community?
- To what extent are anchor organizations (local authority, community bodies) effectively activated and coordinating?
- To what extent is cross-sector cooperation taking place to address community needs?

**Behavioral manifestations (from code):**
- Residents volunteer or express willingness to volunteer in formal or informal frameworks
- Authority or organizations are observed to activate and coordinate community resources
- Mechanisms exist and operate to coordinate volunteers and community organizations
- Cross-sector cooperation (e.g., municipality + NGOs + businesses) is reported or observed

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `mobilization` | `resource_mobilization`, `community_volunteering`, `self_organization`, `civil_society_mobilization`, `digital_mutual_aid` |
| `local_capacity` | `local_capacity_demonstrated`, `resource_shortage`, `volunteer_donor_fatigue` |
| `external_dependency` | `dependency_on_external_aid`, `international_aid_arrival`, `international_aid_withdrawal` |
| `collective_action` | `rapid_mobilization`, `delayed_mobilization`, `conflict_resolution`, `feedback_channel_open`, `coordination_success`, `coordination_failure` |
| `allocation` | `resource_allocation_transparency`, `resource_allocation_opacity` |

**All facet signal types for this component:** `civil_society_mobilization`, `community_volunteering`, `conflict_resolution`, `coordination_failure`, `coordination_success`, `delayed_mobilization`, `dependency_on_external_aid`, `digital_mutual_aid`, `feedback_channel_open`, `international_aid_arrival`, `international_aid_withdrawal`, `local_capacity_demonstrated`, `rapid_mobilization`, `resource_allocation_opacity`, `resource_allocation_transparency`, `resource_mobilization`, `resource_shortage`, `self_organization`, `volunteer_donor_fatigue`

---

### 2.7 `leadership` — Leadership (מנהיגות)

**What it measures:** The perceived ability of formal and informal leadership — including religious figures, spiritual leaders, and community influencers — to lead the community, address its needs, and serve as a source of support and empowerment. Leadership can strengthen or weaken resilience. Key attributes include public trust, personal example, channeling public perceptions and behavior, and representing all segments of the community.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent is local leadership perceived as a source of support for the population?
- To what extent does leadership set a personal example for the public?
- To what extent does local leadership enjoy public trust and provide a sense of security in managing the event?
- To what extent does leadership represent and address the needs of all community segments, including marginalized groups?

**Behavioral manifestations (from code):**
- Residents express that formal or informal leadership is a source of support and security
- Leadership actively encourages residents to follow HFC guidelines (statements, actions, public presence)
- Leadership is reported to function professionally and manage the situation competently
- Residents express distrust, criticism, or frustration with leadership

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `visibility` | `leadership_visible_presence`, `leadership_absence`, `symbolic_vs_substantive_action` |
| `credibility` | `leadership_clear_guidance`, `information_confusion`, `feedback_loop_closure`, `leadership_credibility_loss`, `political_distrust`, `civic_engagement_constructive`, `accountability_demand_constructive`, `blame_shifting`, `responsibility_avowal` |
| `competence` | `consensus_on_priorities`, `dissensus_blocks_action`, `conflict_resolution`, `delegation_empowerment`, `informal_leadership_emergence` |
| `coordination` | `coordination_failure`, `coordination_success` |
| `civic` | `civic_engagement_constructive`, `civil_society_mobilization`, `accountability_demand_constructive` |
| `trust` | `interpersonal_trust`, `institutional_trust`, `media_trust`, `inter_group_trust`, `leadership_credibility_loss`, `political_distrust` |

**All facet signal types for this component:** `accountability_demand_constructive`, `blame_shifting`, `civic_engagement_constructive`, `civil_society_mobilization`, `conflict_resolution`, `consensus_on_priorities`, `coordination_failure`, `coordination_success`, `delegation_empowerment`, `dissensus_blocks_action`, `feedback_loop_closure`, `informal_leadership_emergence`, `information_confusion`, `institutional_trust`, `inter_group_trust`, `interpersonal_trust`, `leadership_absence`, `leadership_clear_guidance`, `leadership_credibility_loss`, `leadership_visible_presence`, `media_trust`, `political_distrust`, `responsibility_avowal`, `symbolic_vs_substantive_action`

---

### 2.8 `belonging_solidarity` — Belonging and Solidarity (שייכות וסולידריות)

**What it measures:** The ability to create a sense of belonging and mutual guarantee among community members. Includes fostering a sense of "shared fate," building and activating programs that strengthen residents' sense of belonging, encouraging mutual aid, and providing responses to groups perceived as outside the community mainstream.

**Principle:** "We are all in the same boat" — a collective sense of shared destiny and mutual responsibility.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent does a sense of solidarity, shared fate, and mutual guarantee exist among the public?
- To what extent do phenomena of mutual aid at the community level exist?
- To what extent are there population groups perceived as "outside the camp" or being scapegoated or blamed?
- To what extent are programs in place to strengthen belonging and address marginalized or vulnerable groups?

**Behavioral manifestations (from code):**
- Residents express a sense of solidarity or shared fate (in their own words)
- Concrete acts of mutual aid between residents are reported (helping neighbors, sharing resources, organizing support)
- Population groups are reported as scapegoated, blamed, or excluded due to the emergency (negative signal)
- Programs or events strengthening belonging are activated and attended

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `mutual_aid` | `solidarity_help_others`, `community_volunteering`, `interfaith_solidarity`, `digital_mutual_aid` |
| `cohesion` | `social_isolation`, `conflict_or_tension`, `cultural_continuity`, `interfaith_tension`, `commemoration_event_observed`, `memorialization_conflict` |
| `inclusion` | `self_organization`, `wellbeing_support_accessed`, `bridging_capital_demonstrated` |
| `exclusion` | `inequitable_resource_access`, `information_inclusivity_gap`, `social_isolation`, `bridging_capital_failure`, `prosocial_norm_violation` |
| `bridging` | `bridging_capital_demonstrated`, `bridging_capital_failure`, `help_seeking_behavior`, `inter_group_trust` |

**All facet signal types for this component:** `bridging_capital_demonstrated`, `bridging_capital_failure`, `commemoration_event_observed`, `community_volunteering`, `conflict_or_tension`, `cultural_continuity`, `digital_mutual_aid`, `help_seeking_behavior`, `inequitable_resource_access`, `information_inclusivity_gap`, `inter_group_trust`, `interfaith_solidarity`, `interfaith_tension`, `memorialization_conflict`, `prosocial_norm_violation`, `self_organization`, `social_isolation`, `solidarity_help_others`, `wellbeing_support_accessed`

---

### 2.9 `wellbeing_at_risk` — Physical and Mental Wellbeing (At-Risk Populations) (דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון)

**What it measures:** The ability of the community to identify and address the needs of vulnerable populations — in routine times and during emergencies. Includes mapping population vulnerability, establishing mechanisms for identifying needs and providing adapted responses: physical, emotional, and informational.

**Principle:** The chain is only as strong as its weakest link. Responses must be tailored to the specific characteristics of vulnerable and at-risk populations.

**Guiding questions (from `RESILIENCE_COMPONENTS`):**
- To what extent is activity taking place to identify the needs of vulnerable populations (first, second, and third circles of vulnerability)?
- To what extent do sufficient and adapted responses exist for population needs — with emphasis on at-risk populations — at the authority level (physical, emotional, informational)?
- To what extent are mechanisms in place to locate, map, and continuously monitor at-risk individuals and groups?

**Behavioral manifestations (from code):**
- Emotional support responses (psychological first aid, mental health services) are available and used by residents showing anxiety or trauma
- Specific responses for at-risk or special-needs populations are reported as active (elderly, disabled, evacuees, etc.)
- Residents in the second or third circle of vulnerability (indirectly affected) receive responses to their needs
- Reports of unmet mental health or physical wellbeing needs among residents

**Facets and signal types (from `componentFacets.js`):**

| Facet | Signal types |
|---|---|
| `physical_harm` | `harm_to_population`, `near_miss_reported` |
| `psychological_distress` | `psychological_distress`, `fear_expression`, `child_distress` |
| `affect_balance` | `calm_confidence`, `fear_expression`, `positive_wellbeing_marker` |
| `care_access` | `wellbeing_support_accessed`, `information_inclusivity_present`, `information_inclusivity_gap`, `school_psychosocial_support_active`, `school_psychosocial_support_gap` |
| `equity` | `inequitable_resource_access`, `equitable_resource_distribution`, `educational_equity_gap` |
| `household_strain` | `reservist_family_strain`, `household_strain_economic`, `parental_burden`, `sleep_disruption_population`, `substance_use_uptick` |
| `population_evidence` | `population_survey_finding`, `sleep_disruption_population` |
| `sensitive_harm` | `domestic_violence_indicator`, `suicide_self_harm_indicator` |
| `hostage` | `hostage_uncertainty_distress`, `hostage_return_event`, `hostage_family_advocacy` |

**All facet signal types for this component:** `calm_confidence`, `child_distress`, `domestic_violence_indicator`, `educational_equity_gap`, `equitable_resource_distribution`, `fear_expression`, `harm_to_population`, `hostage_family_advocacy`, `hostage_return_event`, `hostage_uncertainty_distress`, `household_strain_economic`, `inequitable_resource_access`, `information_inclusivity_gap`, `information_inclusivity_present`, `near_miss_reported`, `parental_burden`, `population_survey_finding`, `positive_wellbeing_marker`, `psychological_distress`, `reservist_family_strain`, `school_psychosocial_support_active`, `school_psychosocial_support_gap`, `sleep_disruption_population`, `substance_use_uptick`, `suicide_self_harm_indicator`, `wellbeing_support_accessed`

---

<!-- docs-sync:END components-detail -->

## 3) Architecture at a glance

The pipeline is intentionally split into **auditable stages** so the LLM does pattern recognition and the code does arithmetic:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ A. INGEST — channel-specific adapters / loaders                          │
│   News APIs, audio (whisper), WhatsApp exports, field reports (xlsx),    │
│   PBO municipality (xlsx), regional PBO, Naftali (xlsx), survey forms,   │
│   Social OSINT (X + Telegram via social_media module).                   │
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
│ E. WRITE — `daily_reports/resilience-report-DATE-HHMM.{md,json}`               │
│   Markdown for humans, JSON for the web client / drift / API.            │
└──────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ F. SERVE — REST API + React UI (`ReportView.jsx`, drift tab)             │
│   /api/report/today, /api/resilience/drift                               │
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

Seven source types can feed the assessment; toggles live in `pipeline-config.json` at the repo root:

```json
{
  "sources": {
    "news":     { "enabled": true,  "description": "Homefront news articles" },
    "radio":    { "enabled": false, "description": "Radio broadcast transcripts (ashams, tzafon, kan-bet, ...)" },
    "whatsapp": { "enabled": true,  "description": "WhatsApp reports" },
    "field":    { "enabled": true,  "description": "Professional squad field visit reports" },
    "pbo":      { "enabled": true,  "description": "PBO municipality daily reports" },
    "naftali":  { "enabled": false, "description": "Naftali weekly questionnaire" },
    "social":   { "enabled": true,  "description": "Social media OSINT (X + Telegram): signals-social-*.json" }
  }
}
```

Each source produces a `signals/signals-{source}-{YYYY-MM-DD}.json` file (field signals live under `business_modules/visits/data/signals/`; social OSINT under `business_modules/social_media/data/signals-social-{YYYY-MM-DD}.json`). `assess-signals.js` then discovers and merges these files within the requested date window.

| Source | `source_type` tag | Owner module | Native format | Conversion to text/signals | Geographic default |
|---|---|---|---|---|---|
| **News** | `news` | `business_modules/news-sites` | NewsAPI.ai JSON from Israeli outlets | `extract-homefront-articles.js` → `articles-homefront.md` (LLM Haiku pre-filter on title+snippet, cross-site dedup by title) | National (filter for *north* applies later) |
| **Radio / Audio** | `radio` | `business_modules/audio` (transcribe) → `business_modules/resilience` (extract) | mp3 / mp4 broadcasts | `audio-to-md.js` → Whisper transcription (chunked if >24 MB) → `articles-audio-{station}-{program}-{date}.md` | National |
| **WhatsApp** | `whatsapp` | `business_modules/whatsapp` | Exported group messages | `whatsapp-to-md.js` → `articles-whatsapp-{date}.md` | Treated as `north` (operator-curated channel) |
| **Field reports** | `field` | `business_modules/visits` | Hebrew expert field notes from population-behavior officer visits to northern communities (one MD bundle per visit day) | `articles-field-reports-{date}.md` (already markdown) | Always `north` |
| **PBO municipality** | `pbo` | `business_modules/pbo_report_muni` | Excel `north_<day>_4.xlsx` (structured per-component scores per municipality) | `extract-pbo-signals.js` directly emits `signals-pbo-{date}.json` (no LLM extraction — structured input is converted by polarity around 0.5) | Always `north` |
| **PBO regional** | `pbo_regional` | `business_modules/pbo_report_regional` | Excel per regional cluster (`baram`, `galma`, `golan`, `hiram`, `naftali`) | Similar conversion path | Always `north` |
| **Naftali** | `naftali` | `business_modules/pool` | Weekly municipal questionnaire | `pool/input/extract-naftali-signals.js` maps severity dimensions and free-text fields → signals | Always `north` |
| **Social OSINT** | `social` | `business_modules/social_media` | X posts + Telegram channel messages | `social-media:gather-daily` → Haiku classify → `signals-social-{date}.json`; `social-media:treat` → `signals[]` | North-biased queries when `--north`; scope filter applies like news/radio |
| **Survey** (optional) | (varies) | `business_modules/resilience` (survey Excel + writers under `app/` / `infrastructure/adapters/`) | Municipality survey Excel | `npm run analyze-survey` → `runAnalyzeSurvey.js` | Configurable |

Structured north-theater feeds (`field`, `pbo`, `pbo_regional`, `naftali`, `field_whatsapp`, `whatsapp`) stamp `district_id` at extract (or inherit from bundle at assess); legacy bundles without `district_id` fall back to `north` in code. News, radio, and social signals require **resolved geo** matching the target district for regional scope (otherwise excluded); `text_inferred` geo may appear in narrative context but is metrics-ineligible under epistemic v2 — see §8.9 and §12.

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
  wellbeing_at_risk:          'wellbeing_support_accessed',
};
const COMPONENT_TO_NEG_SIGNAL = {
  narrative:                 'resilience_narrative_negative',
  /* ... */
  wellbeing_at_risk:          'psychological_distress',
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
- **LLM Haiku pre-filter** on title + short body snippet: keeps only articles plausibly carrying *population-behavior* content (not pure geopolitical/military analysis). The keyword list at `business_modules/social_media/domain/services/homefrontKeywords.js` is auxiliary and used for social ingest.
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

**Live webhook — group vs DM:**

| Path | Behavior |
|------|----------|
| **Group messages** | One-shot extract via `whatsappResilienceAnalyzer.js` → Hebrew reply |
| **DM (direct messages)** | Adaptive chatbot: [`conversationStateMachine.js`](../business_modules/whatsapp/domain/conversation/conversationStateMachine.js) tracks wizard state per phone; [`gapEngine.js`](../business_modules/whatsapp/domain/conversation/gapEngine.js) identifies missing evidence; draft generation → user confirm → [`reportBuildService.recompute()`](../business_modules/report_build/app/reportBuildService.js) when wired from [`app.js`](../app.js); signal extraction on approval |

DM flow persists conversation state in SQLite (`whatsappConversationStore.js`). Group export path feeds the daily pipeline like any other source.

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

`business_modules/pool/`:

- Weekly questionnaire Excel (`naftali_week_4.xlsx`). One signals file per week (`signals-naftali-{week-end-date}.json`).
- `pool/input/extract-naftali-signals.js` maps dimension-driven severity → signal type, polarity by direction: financial requests, school mental health, parental stress, couple/parent-child conflicts, vulnerability counts, plus free-text fields like volunteer initiatives, staff shortages, and main challenges.

### 5.8 Social OSINT — X + Telegram (`source_type: 'social'`)

`business_modules/social_media/`:

- **Daily gather** (`npm run social-media:gather-daily -- --date YYYY-MM-DD --days N [--north] [--execute]`):
  - **X:** cluster queries from `xHomefrontClusterQueries.js` → X API v2 counts + search → `x-raw-daily-{date}-{lang}-{cluster}.json` → behavior prefilter → Haiku batch classifier (`socialCandidateClassifier.js`).
  - **Telegram:** MTProto client over configured public channels (`telegram-public-channels.json`) → `telegram-raw-daily-{date}-*.jsonl` → same classify path.
  - Merged `findings[]` written to `business_modules/social_media/data/signals-social-{date}.json`.
- **Treat** (`npm run social-media:treat` or auto after gather): `findingToSignalMapper.js` converts findings → resilience `signals[]`; writes `social-osint-report-{date}.md`.
- **Assessment:** `assess-signals.js` loads `signals-social-*.json` when `pipeline-config.json` has `social.enabled`.
- **UI:** Social media tab — Daily feed (`findings[]` by emergency category) and Topic search (on-demand X/Facebook/Telegram via `socialMediaTopicFetchService.js`).
- **Env:** `X_BEARER_TOKEN`, `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` / `TELEGRAM_SESSION`, `ANTHROPIC_API_KEY`. One-time Telegram session: `npm run social-media:telegram-session`.

### 5.9 Survey (one-off path)

Field survey analysis lives under **`business_modules/resilience`** (`surveyExcelLoader`, `surveyEvaluator`, `surveyReportWriter`, and `resilience/input/analyzeSurveyInput.js`) and covers a separate, ad-hoc municipality-survey analysis flow that produces its own report alongside the daily one. Entry: **`npm run analyze-survey`** (`cross-cut-modules/geo/input/runAnalyzeSurvey.js`).

---

## 6) Stage 2 — Signal extraction (LLM, closed vocabulary)

Driver: `business_modules/resilience/input/extract-signals.js`
Core logic: `business_modules/resilience/infrastructure/claudeExtraction.js` (barrel re-export via `claudeEvaluator.js`; multipass in `extractionPasses.js`; verification in `signalVerification.js`).

### 6.1 The signal data model

Every emitted signal carries:

| Field | Description |
|---|---|
| `signal_type` | One of ~166 closed-vocabulary types in `SIGNAL_CATALOG` (see §6.2). |
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
solidarity_help_others:    { belonging_solidarity: +1.0, wellbeing_at_risk: +0.7, community_capital: +0.6, narrative: +0.3 },
service_disruption:        { functional_continuity: -1.5, wellbeing_at_risk: -0.4 },
leadership_clear_guidance: { leadership: +1.1 },
coordination_failure:      { leadership: -1.0, community_capital: -0.6, functional_continuity: -0.5 },
fear_expression:           { wellbeing_at_risk: -0.7, narrative: -0.3 },
rumor_spread:              { information_communication: -1.2, narrative: -0.5 },
```

Negative weights make the signal *reduce* the component score; many signals also carry small "spillover" weights (e.g. `service_disruption` spills `−0.4` into `wellbeing_at_risk`, and `evacuation_displacement` spills `−0.3` into `belonging_solidarity`), enforced through `SIGNAL_TO_COMPONENTS` and tested for sign consistency. Note that **harm_to_population no longer auto-boosts `belonging_solidarity`** — the older +0.2 spillover was removed in B1 because mutual-aid response should be evidenced via `solidarity_help_others`, not inferred automatically from harm.

Four signal types added in this revision (closing a long-standing gap between the prompt and the catalog):

- **`political_distrust`** — residents or named civic figures publicly demand accountability or distrust the political handling of the emergency. Routes to `leadership` (negative), `narrative` (negative), and `information_communication` (negative).
- **`leadership_credibility_loss`** — concrete loss of trust in named leadership (broken promises, false reassurances). Routes to `leadership` (negative) and `narrative` (negative).
- **`evacuation_displacement`** — residents evacuated, displaced, or unable to return home. Routes to `functional_continuity` (negative), `wellbeing_at_risk` (negative), and `belonging_solidarity` (negative).
- **`routine_disruption`** — civilian daily routines (commuting, shopping, leisure, social rhythms) visibly disrupted. Distinct from `service_disruption` (institutional closures). Routes to `functional_continuity` (negative) and `wellbeing_at_risk` (negative).

### 6.3 Multipass grouped extraction (E2)

Instead of one mega-prompt, extraction runs **3 grouped Haiku passes per batch**, each with the full classification rules but a *focused* signal vocabulary:

- **Pass A — Protective Behavior** (compliance + risk)
- **Pass B — Institutional Response** (information + continuity + leadership)
- **Pass C — Social Fabric & Wellbeing** (social + narrative + resources + wellbeing)

This stops the model from being asked to weigh "is this `leadership_clear_guidance` or `calm_confidence` or `service_continuity`?" in a single breath. Multipass costs ~1.8× per-batch Haiku tokens with smaller per-pass prompts; set `RESILIENCE_EXTRACT_MULTIPASS=0` to revert to a single pass.

### 6.4 Closed-vocab self-check pass (E5)

After the grouped passes, a 4th cheap Haiku call sends each candidate signal back with the full closed vocabulary and asks **yes / no / uncertain — is this a correct instance of its declared `signal_type`?** Verdicts of `no` are dropped; `uncertain` is kept (false-negative cost > false-positive cost at this stage).

### 6.5 Source-specific prompts

Three prompt prefixes specialise the extraction by content kind, defined in `claudeExtraction.js`:

- **News** — default; emphasises atomic extraction, no journalist framing, preference for verbatim quotes.
- **Radio** (`AUDIO_SIGNAL_EXTRACTION_PREFIX`) — explicit, very strict allow-list ("ONLY extract for civilians coping with the emergency, services operating or failing, community-level emergency response, emergency-caused economic hardship, psychological impact"); explicit deny-list of geopolitical analysis, military appointments, political punditry, Israeli-Palestinian commentary, criminal/accident investigations.
- **Field reports** (`FIELD_REPORT_SIGNAL_EXTRACTION_PREFIX`) — Hebrew domain-vocabulary translation table, default `scope_level: 'repeated_pattern'`, explicit instruction to split each clause/phrase into its own signal.

Whatsapp uses the news prompt (the channel typically carries operator-authored bullets resembling field-report shorthand).

### 6.6 Pre-filter for relevance (paragraph scoring)

Before sending each article body to the LLM, `extractTopKParagraphsByRelevance(body, 6)` selects the most behaviorally relevant paragraphs by counting Hebrew + English keyword hits ("מקלט", "פינוי", "shelter", "evacuee", "anxiety", "volunteer", "siren", "ממ\"ד", "אזעקה", …). This concentrates LLM tokens on paragraphs likely to carry behavioral evidence and keeps the body cap (`MAX_BODY_CHARS = 2000`) effective.

When `RESILIENCE_EXTRACT_RAG_ENABLED` (see [`LLM_CHAT.md`](LLM_CHAT.md) Tier 2 table), `extract-signals.js` archives with ingest-time chunk indexing, attaches stable `source_id` per article, and `selectArticlePromptSpans` retrieves hybrid archive chunks (domain A/B/C intent + 7–14 day window) before Haiku. Keyword / inline semantic selection remains the fallback.

### 6.7 Optional dual-model agreement (E3)

**Not the daily pipeline default.** When `RESILIENCE_SECOND_EXTRACT=1`, the **evidence-submit auxiliary path** (`resilienceAnalysisService.js` via `POST /api/evidence-submit`) runs a second `extractSignals` pass (optionally with `RESILIENCE_SECOND_EXTRACT_MODEL`). Daily `extract-signals.js` CLI uses single-pass extraction unless you call the auxiliary service. `mergeDualExtractionSignals` flags signals that survive both passes with `_dual_pass_agreement: true`, and `contributionForSignal` multiplies their evidence by `RESILIENCE_DUAL_AGREEMENT_BOOST` (default `1.05`, clamped to `[1, 1.2]`).

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

When `OPENAI_API_KEY` (or `RESILIENCE_EMBEDDING_API_KEY`) is set and `RESILIENCE_EMBEDDING_VERIFY=1` (default on with key), borderline failures from the n-gram verifier may be rescued by an OpenAI-embedding cosine similarity check. Tunables: `RESILIENCE_EMBEDDING_SIM_THRESHOLD` (default `0.82`), `RESILIENCE_EMBED_BORDERLINE_LOW`, `RESILIENCE_EMBEDDING_MODEL`. Single choke-point in `applyEvidenceVerifier` inside `claudeExtraction.js` (NOT inside `assess-signals.js`).

### 7.3 Within-batch dedup

`dedupeSignalsWithinBatch` collapses signals identical on `(article_index, signal_type, normalised_evidence)` within a single extraction batch.

### 7.4 Within-source dedup (across day windows)

In `assess-signals.js`, when multiple bundles of the same source type are loaded (e.g. three days of field reports), signals that share `(signal_type | article_source | normalised_evidence)` are collapsed to the highest-`temporal_weight` (most recent) instance. Prevents the same field team's observation from counting once per replay day.

### 7.5 Cross-source dedup (E7)

`crossSourceDedup` (in `assessSignalsHelpers.js`) collapses the same primary quote republished by multiple outlets — so when Ynet, Maariv, and Walla all carry the same Magen David Adom statistic, the system counts one signal, not three. Without this step `coverage_ratio` would inflate purely from wire-copy republication.

The dedup key is **`source_type | signal_type | normalised_evidence`** (A4). Keying *within* `source_type` means a press quote and a field-team observation describing the same fact are no longer collapsed: the diversity layer (`source_diversity_factor` + the source-type cap) needs both channels to remain visible. Empty-evidence signals are passed through keyed by article identity so they cannot collide with substantive signals.

When `RESILIENCE_DEDUP_CLUSTER_ENABLED`, `crossSourceDedupClustered` indexes evidence into `rag_story_clusters` and collapses by `story_cluster_id` instead of pairwise embedding scans at assess time.

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

Each capped signal carries audit fields on the assessment JSON: `_cap_scale_factor`, `_cap_layer` (`source_type` | `article_source`), and `_contribution_pre_cap` vs `_contribution` in `top_contributors`. Analyst **Why this score** shows pre→post when they differ.

### 8.9 Epistemic eligibility (metrics vs context)

When `RESILIENCE_EPISTEMIC_GEO_V2` is enabled (default; set `=0` for legacy):

| Provenance | In component metrics? | In narrative? |
|---|---|---|
| `verified_geo` / `source_assigned` | Yes | Yes |
| `resolution.provenance === 'text_inferred'` on news/radio/social | **No** — context only | Yes |
| metrics-unsafe resolved geo (`usableForMetrics: false`, north scope, low confidence) | **No** — context only | Yes |
| `macro_national` (legacy reports only) | **No** — `macro_signals[]` bucket | National backdrop in synthesis only |

Implementation: `evidenceEligibility.js` → `annotateSignalsEpistemics`, `partitionMacroSignals`, `metricsEligible`. **Regional scope** (`isRegionalReportScope`) scores only `metricsSignals`; macro/context signals appear in `assessment.macro_signals` (operator API redacts to `macro_signals_summary`).

### 8.10 Suppression transparency (analyst)

| Field | Meaning |
|---|---|
| `score_raw` | Pre-cap, pre-floor headline math |
| `score_headline` | Published score after cap + floor |
| `suppression_delta` | `score_raw − score_headline` |
| `suppression_breakdown.source_cap` | Effect of source/outlet caps |
| `suppression_breakdown.min_mass_floor` | Effect of thin-evidence `[3,8]` floor |
| `counterfactual_no_caps` | Same as raw score (explicit alias) |

### 8.10.1 Calibration deficit and weight sensitivity (analyst)

| Field | Meaning |
|---|---|
| `score_calibrated` | Headline score shrunk toward 5.5 by `calibration_trust` (headline `score` unchanged) |
| `calibration_trust` / `calibration_deficit` | Trust in author-set weights from validation maturity (Tier 3–5) |
| `weight_sensitivity` | Shadow ±12% weight band (Tier 3+): `perturbed_low`, `perturbed_high`, `band_width`, `fragile` |

Sonnet narrative prompts include `SUPPRESSION_TRACE` tokens when caps/floors move the headline score (see `claudeNarratives.js`). Trace also emits when `|source_cap_effect|≥0.5` or `|thin_evidence_floor|≥0.5` even without `source_cap_binding`. Prompts include `dominant_outlet_key`, top contributors (raw→capped), and a required `data_quality_caveat` field when suppression applies; deterministic `validateSuppressionCompliance()` enforces caveat + no psych speculation.

### 8.11 Operator thin-evidence policy (Option C)

When `RESILIENCE_THIN_EVIDENCE_POLICY` is on (default) and `evidence_mass < 1.5`:

| Condition | Operator instrument | Shows 1–10? |
|---|---|---|
| `salience_critical` (high-salience bypass) | `critical_single_signal` | **Yes** (with alert) |
| Raw score inside `[3, 8]` | `limited_evidence_neutral` | No |
| Raw score outside `[3, 8]` | `unverified_alert` | No |
| Zero metrics-eligible signals | `insufficient_data` | No |
| `polarization > 0.5` and mass in `[1.5, 4)` | `contested_thin` | No |

Derived by `thinEvidencePolicy.js` → `deriveInstrumentState()` → operator API redaction strips numeric score keys.

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
| `wellbeing_at_risk` | 2.5 | 2.0 |

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

**High-salience bypass** (`highSalienceBypass.js`, on by default): when mass is still below 1.5 but a single verified high-stakes signal dominates (≥85% of component mass), passes critical-stakes + credibility-booster gates, the component may receive `salience_critical: true` and operator instrument `critical_single_signal` (score visible with alert). If the raw score would fall below 3, `floor_bypassed: true` skips the lower clamp asymmetrically; thin positive scores above 8 remain capped. Disable with `RESILIENCE_HIGH_SALIENCE_BYPASS=0`.

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

High-certainty days move the smoothed line faster; thin-evidence days nudge it slightly. Reads up to 14 trailing days of `daily_reports/resilience-report-*.json` for context.

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

### 9.6 Dual baseline — chronic metrics (peace-time anchor)

When `RESILIENCE_DUAL_BASELINE=1` (default), each component also carries:

| Field | Meaning |
|---|---|
| `delta_chronic` | `score − peace_time_anchor` (from `config/peaceTimeAnchors.json`) |
| `z_score_chronic` | Chronic z vs anchor (σ≈2 heuristic until Tier 3 calibration) |
| `erosion_index` | `(anchor − score_smoothed) / 10`, clamped `[0,1]` |
| `exhaustion_days` | Count of sub-4 days in trailing 14-day history |

Drift alerts: `long_term_degradation_warning` (z ≤ −2), `erosion_elevated` (erosion > 0.35). Drift UI shows mean erosion / chronic-z sparklines.

**Author-set anchors and σ — not fitted until Tier 3+ report history exists.**

### 9.7 Data void / digital darkness (separate from scores)

`business_modules/resilience/domain/services/dataVoid/` — not a component score. Multi-channel EWMA baselines (distinct `article_source` per digital channel), z-score drop detection, and per-cluster void via PBO subregion.

**Void levels and triggers**

| Level | Trigger | `reason` |
|---|---|---|
| `critical` | `digital_darkness`: digital volume = 0 while field/PBO/`field_whatsapp`/`naftali` active and historical digital baseline ≥ 1 | `digital_darkness` |
| `critical` | `total_silence`: digital = 0 and field = 0 with established digital baseline (≥ `RESILIENCE_VOID_TOTAL_SILENCE_MIN_BASELINE`, default 3) | `total_silence` |
| `critical` | `partial_silence`: digital > 0 but both digital and field below 25% of baseline | `partial_silence` |
| `critical` | `connectivity_outage` signal or `infrastructure_probe` outage ingest | `connectivity_outage` / `probe_outage` |
| `elevated` | Very sparse sampling (both channels quiet, &lt; 2 signals total) | `sparse_sampling` |
| `warning` | Digital z-score drop or volume &lt; 25% baseline (non-zero digital still present) | `digital_volume_drop` / `digital_z_drop` |

**Epistemic gates (deterministic — not narrator-only)**

Computed in `epistemicGate.js` after scoring; attached as `assessment.epistemic_status` and `assessment.assessment_mode`:

| Outcome | Scoring behavior | Operator view |
|---|---|---|
| `digital_darkness` | Re-score using **field-family sources only** (`field_anchor_only`); stash digital-inclusive scores in `stale_digital_scores` | Field-anchor scores shown; digital scores marked stale |
| `level >= elevated` (non-darkness) | **Abstention**: all component `score` null, `confidence: insufficient_data`; instrument `sampling_blind` | No headline scores |
| `level === warning` | Scores kept | `sampling_status: degraded` banner |
| `level === none` | Normal scoring | `sampling_status: normal` |

North scope: void index runs on **scope-filtered** signals (`signalsForScoring`), not the national pool — so Tel Aviv news cannot mask a north-specific digital void. Historical baseline from prior scope-matched reports via `loadHistoricalSignalDays()`.

**Connectivity probes:** JSON/JSONL under `business_modules/resilience/data/connectivity-probes/` → `source_type: infrastructure_probe` (cap-exempt, forces critical void).

Surfaces `assessment.data_void` with `level`, `digital_darkness`, `information_vacuum_index` (0–1), `affected_clusters[]`, channel baselines. Operator red banner + narrator must not treat silence as stability.

Flag: `RESILIENCE_DATA_VOID=0` disables void index and gates.

### 9.8 Press repetition (`media_mention_mass`)

Pre-cap press-only mention mass per component — information-environment metric, **not** merged into headline score. Shown to analysts in ReportView.

---

## 10) Stage 6 — Narrative generation (LLM, no re-scoring)

`generateNarratives()` in `claudeNarratives.js`, model `RESILIENCE_NARRATIVE_MODEL` (default `claude-sonnet-4-6`). The narrator receives pre-scored components, signal evidence with stable refs (`[S1] ref=type@url:…`), co-occurrence constraints, and optional prior-report trend tags.

### 10.1 Narrative grounding stack (default ON)

Pipeline:

1. **Signal ref registry** — stable `[S#]` refs per signal (`business_modules/resilience/domain/services/narrativeGrounding/`).
2. **Haiku facts-pass** (`narrativeFactsExtract.js`) — extracts `narrative_claims[]` before Sonnet (unless disabled).
3. **Sonnet polish** — evidence-first workflow; preserves claim refs; writes `narrative`, `evidence[]`, `cross_component_synthesis`.
4. **Schema validation** (`validateNarrativeOutput`) — manifestations subset, evidence required, ref validity, relation tags, synthesis URL cap.
5. **Haiku relation judge** (`narrativeRelationJudge.js`) — flags `invented_relation` per claim.
6. **Deterministic sentence grounding** (`sentenceGroundingChecker`) — per-component and synthesis scores; sets `interpretive_summary` when score &lt; threshold.

Retry loop (up to 3 attempts): validation or judge failures append feedback to the user message.

**New assessment fields:**

| Field | Description |
|---|---|
| `narrative_claims[]` | `{ text, signal_refs, relation }` atomic claims (analyst view) |
| `narrative_grounding_score` | 0–1 sentence overlap with cited evidence |
| `grounding_issues[]` | Ungrounded sentences (analyst view) |
| `interpretive_summary` | true when grounding weak — operator sees warning banner |
| `narrative_grounding_summary` | Assessment-level `{ mean_score, components_below_threshold }` |

**Env flags** (default `1` = enabled; set `0` to disable):

| Variable | Effect |
|---|---|
| `RESILIENCE_NARRATIVE_GROUNDING` | Master switch for validation + grounding scores |
| `RESILIENCE_NARRATIVE_FACTS_PASS` | Haiku claims extraction before Sonnet |
| `RESILIENCE_NARRATIVE_JUDGE` | Haiku invented_relation judge |
| `RESILIENCE_NARRATIVE_GROUNDING_MIN` | Threshold for `interpretive_summary` (default `0.6`) |
| `RESILIENCE_NARRATIVE_SYNTHESIS_MAX_URLS` | Synthesis URL cap (default `8`) |

Adversarial CI: `tests/business_modules/resilience/narrativeGrounding.adversarial.test.js` (deterministic, no live LLM).

### 10.2 Sonnet output (per component)

| Field | Description |
|---|---|
| `data_quality_caveat` | 1–2 sentence methodological note on score/data limits (required when `SUPPRESSION_TRACE` applies). Shown to operator and analyst; excluded from narrative grounding overlap check. |
| `narrative` | 3–5 sentence behavioral description grounded in claims/evidence. |
| `narrative_claims` | Atomic claims with signal refs and relation tags. |
| `manifestations_evidenced` | Which behavioral manifestations have evidence today. |
| `manifestations_absent` | Manifestations with no evidence (explicit absence). |
| `evidence` | Curated evidence items with source links when URLs exist. |

Top level:

| Field | Description |
|---|---|
| `cross_component_synthesis` | Bullet list + explicit non-claims; max 8 distinct URLs. |
| `evidence_quality_note` | 1 sentence on direct quotes vs reported facts. |

Hard rules in prompt:

- **Do not re-score.** Scores are final.
- **Suppression / data quality:** when `SUPPRESSION_TRACE` present, fill `data_quality_caveat` first; name source cap, floor, or dominant outlet; forbid psych speculation to explain score gaps.
- **Anti-relationship:** co-occurrence ≠ connection; forbidden causal connectives across unrelated refs.
- **Evidence-first:** fill `data_quality_caveat` (if required), then `evidence[]` and `narrative_claims`, then prose.
- **Prior reports:** trend tags only — no factual import from earlier narratives.
- **Trace to evidence.** No outside world knowledge.

Post-parse validation includes `validateSuppressionCompliance()` (caveat required, no hidden-anxiety framing). Narrative grounding scores apply to behavioral `narrative` only, not `data_quality_caveat`. Operator UI shows `source_cap_binding` instrument badge and the caveat caption.

---

## 11) Stage 7 — Report writing and UI rendering

### 11.1 Report writer

`business_modules/resilience/infrastructure/reportWriter.js` writes three files to `daily_reports/`:

- `resilience-report-{date}-{HHMM}.md` — full markdown (scores, CIs) for analysts and offline audit.
- `resilience-report-{date}-{HHMM}-brief.md` — operator-oriented markdown (narratives + evidence; no `/10`).
- `resilience-report-{date}-{HHMM}.json` — structured payload for the React client, drift dashboard, and API.

For *north* scope the prefix is `resilience-report-north-…`.

The markdown report contains:

1. Header table (date, scope, content kind, sources, articles analysed).
2. Executive summary (cross-component synthesis).
3. **Component overview table** — assessment reliability, evidence level (= certainty), evidence base (= signal count), article coverage.
4. Per-component sections — score, confidence, signal count, narrative, supporting evidence, weakening evidence, manifestations evidenced / absent, **facets** as small bars.
5. Evidence quality note.
6. **Signal appendix** — every extracted signal grouped by type, each linking to the source article URL where available.

### 11.2 Display tiers (operator vs analyst)

Scoring still runs in code for every report (full JSON on disk under `daily_reports/`). **What users see** is controlled by display tier logic in `business_modules/resilience/domain/services/assessmentDisplayTier.js`.

| Tier | Audience | API / UI | Contents |
|------|----------|----------|----------|
| **Operator (default)** | Field, municipal | `GET /api/report/today` (default) | Attention queue, operator recommendations (HITL), component lenses filter, narratives, evidence, expanded `instrument` metrics (mass, polarization band, suppression). **No** headline 1–10 scores. |
| **Internal (pipeline)** | Narrative LLM | `generateNarratives` prompt | Instrument tags by default (`RESILIENCE_NARRATIVE_INCLUDE_SCORES=false`). Set env to `true` to include numeric scores in the prompt again. |
| **Analyst** | Calibration / reviewers | `GET /api/report/today?view=analyst` when `canViewAnalystDisplay(email)` is true | Same redacted API as operator (scores stripped at boundary); calibration uses **`GET /api/resilience/drift`** (instrument series default; score history toggle). Validation and catalog tools on analyst SPA. |

Analyst access: `config/userAccess.json` levels `analyst` / `maintainer`, or env overrides `RESILIENCE_ANALYST_EMAILS` / `RESILIENCE_MAINTAINER_EMAILS` (`cross-cut-modules/auth/userAccess.js`). When analyst gating is active, drift and validation routes return **403** unless the caller qualifies.

### 11.3 Web UI

**Operator app** — `client/src/MainApp.jsx` splits navigation into **Daily Assessment** (report) and **data-source tabs** (`DataSourcesNav`): News, Radio, Social media, Trends, Visits, PBO reports, Pools (Naftali + Education), and Report bot. Daily Assessment renders `ReportView` with **`displayTier="operator"`** (instrument badges, no `/10` scores). Allowlisted analysts see an **Analyst view** link in the header (`getAnalystSiteUrl()` → separate SPA).

**Analyst app** — `analyst-site/src/AnalystApp.jsx` is a dedicated analyst SPA (same shared `ReportView` component). It passes **`displayTier="analyst"`**, **`showValidationReview`**, drift sparklines, attention items, and **`CatalogProposalPanel`**. This is where validation review, catalog proposals, and full numeric scores live in the UI — not on the operator Daily Assessment tab.

**District scope:** `DistrictScopeSwitcher` on Daily Assessment and on data-source tabs (News, Radio, Social media, Report bot, Visits) — scopes: `national | north | south | jerusalem | dan | haifa`. Regional reports use prefix `resilience-report-{scopeId}-*`.

On **desktop**, footer actions and the chat launcher open **panel popups** (`client/src/lib/panelPopup.js`): Chat (SSE assistant), Write Report (`report_build`), Send Data (evidence upload), Docs, and Settings (mailing preferences). On smaller viewports, Chat uses an in-app slide-up panel instead.

`client/src/components/ReportView.jsx` renders the assessment (operator or analyst tier):

**Operator mode** (main app default):

1. **Epistemic banner** and **evidence overview** (adequate / thin / contested counts).
2. **What needs attention** — unified attention items (data void, presence gates, pattern-driven recommendations).
3. **Decision brief** — batch LLM synthesis on `assessment.decision_brief` (`RESILIENCE_DECISION_BRIEF_ENABLED`; no 1–10 scores).
4. **Suggested actions** — pending `operator_recommendations` with acknowledge/dismiss (also via chat `propose_operator_recommendation`).
5. **Component lenses** filter bar (all / needs attention / thin / contested / per-component chips).
6. **Executive synthesis** and eight **component cards** with instrument badges + raw metrics, narrative, evidence accordion.

**Analyst mode** (`analyst-site` / `displayTier="analyst"`):

1. **`ValidationReviewPanel`** and **`CatalogProposalPanel`**.
2. Same decision-support surfaces as operator (attention, recommendations, filters) plus **Norris diagnostic lens** (4R diagnostics, no headline score tag).
3. Per-component **polarization drift sparkline** by default; optional **score history** toggle for calibration.
4. **Top contributors** (from `instrument.top_contributors` when scores redacted) for weight audit.
5. Full numeric history on **`ResilienceDriftPanel`** (polarization default; score calibration toggle).

### 11.4 API surface

| Endpoint | Description |
|---|---|
| `GET /api/report/today?view=operator\|analyst&scope=national\|north\|south\|jerusalem\|dan\|haifa` | Latest assessment redacted per tier. Operator view uses `-brief.md` when on disk (no `/10`). Response includes `display_view`, `attention_items`; `analyst_denied: true` when analyst was requested but not allowlisted. |
| `POST /api/report/recommendations/:id/acknowledge` | Acknowledge or dismiss a pending `operator_recommendation` (persists to report JSON). |
| `GET /api/resilience/display-capabilities` | `{ canViewAnalyst: boolean }` for the signed-in user (optional Bearer token). |
| `GET /api/validation/review-queue?date=&scope=` | Analyst-only review queue items (SQLite default + JSONL export). |
| `GET /api/validation/review-queue/{date}/{scope}/{articleKey}` | Single queue item detail (analyst-only). |
| `GET /api/validation/review-queue/{date}/{scope}/{articleKey}/context` | RAG context bundle for review item. |
| `POST /api/validation/review-queue/{date}/{scope}/{articleKey}/explain` | One-shot Haiku explain from frozen context. |
| `POST /api/validation/review-queue/{date}/{scope}/{articleKey}/agent` | Multi-turn investigate agent (see [AGENTIC_MECHANISMS.md](./AGENTIC_MECHANISMS.md)). |
| `POST /api/validation/review-queue/{date}/{scope}/{articleKey}/decision` | Submit analyst label/decision (incl. social quarantine confirm/dismiss). |
| `GET /api/catalog-learning/proposals`, `GET …/proposals/:id` | Catalog proposal list/detail (analyst). |
| `POST /api/catalog-learning/proposals/generate`, `POST …/proposals/:id/review` | LLM draft proposals + analyst review. |
| `GET /api/pbo/municipal-reviews?date=` | Municipal PBO completeness review list (PBO reports → Local sub-tab). |
| `GET/POST /api/pbo/municipal-reviews/{date}/{municipality}/*` | Review detail and officer reply thread. |
| `GET /api/districts` | List of report scope ids for UI (`national` + five regional districts). |
| `GET /api/operator/district-access` | Operator district registration check (regional access control). |
| `GET /api/resilience/drift?scope=national\|north\|south\|jerusalem\|dan\|haifa&days=30` | Analyst-gated via `canViewAnalystDisplay`. Feeds **per-component score sparklines** in Report (analyst mode). Response also includes signal volume, polarization/certainty/erosion series, and `alerts` (max 90 days). Full multi-chart drift dashboard UI (`ResilienceDriftPanel`) is implemented but **not mounted** in the current client — use API or re-wire the component if you need the standalone dashboard. |
| `GET /api/visits/...` | Field-reports dashboard (days, signals, municipalities). |
| `GET /api/social-media/daily?date=&category=&lang=` | Social OSINT daily feed (`findings[]`). |
| `POST /api/social-media/fetch-topic` | On-demand topic search (X / Telegram / Facebook). |
| `GET /api/search-trends/dashboard?district=&days=&refresh=1` | Search interest dashboards (Trends tab; separate from assessment scoring). |
| `GET /api/search-trends/districts`, `/topic-groups` | Trends tab metadata. |
| `GET /api/news-sites`, `GET /api/news-sites/daily?date=` | News ingest dashboard + daily article feed (News tab). |
| `GET /api/radio`, `GET /api/radio/daily?date=` | Radio ingest dashboard + daily transcript feed (Radio tab). |
| `GET /api/geo/resolve?name=` | Debug locality resolve (see [GEOGRAPHIC-ANALYSIS.md](./GEOGRAPHIC-ANALYSIS.md)). |
| `GET /api/geo/localities?q=&scope=` | Locality typeahead (report build). |
| `GET /api/geo/unknown-queue`, `POST …/unknown-queue/:id/status` | Analyst unknown-locality review queue. |
| `GET /api/chat/sessions*`, `POST /api/chat/sessions` | Chat session CRUD (SQLite-backed). |
| `POST /api/chat` (SSE) | Evidence-aware chat assistant; body requires `sessionId`. |
| `POST /api/chat/confirm-action` | HITL confirm for chat propose tools (analyst). |
| `GET /api/docs/search?query=` | Product docs RAG (Docs panel). |
| `POST /api/report-build/start`, `/turn`, `/suggest`, `/confirm`, `/cancel` | Write Report guided drafting flow. |
| `GET /api/mail/preferences`, `POST /api/mail/send-digest` | Settings popup — mailing preferences and digest. |
| `POST /api/translate` | Batch translation (reports, social OSINT UI) via `business_modules/translation/app/translationService.js` (route in `api/routes/reportRoutes.js`). |
| `POST /api/video/download-url`, `POST /api/video/local-file` | Video/YouTube evidence ingest helpers via `business_modules/video/` (routes in `api/routes/reportRoutes.js`). |
| `POST /api/evidence-submit`, `GET /api/evidence-submissions/*` | Send Data popup — on-demand analysis via `resilienceAnalysisService` (auxiliary path, not daily pipeline). |
| `GET /api/monitoring/health` | Public health probe (no analyst gate). |
| `GET /api/monitoring/pipeline`, `GET /api/monitoring/summary` | Analyst-gated pipeline status and run summaries (`cross-cut-modules/monitoring/`). |

---

## 12) Geographic scoping (national + five regional districts)

**Report scopes:** `national | north | south | jerusalem | dan | haifa`. Legacy aliases normalize via `normalizeIsraelDistrictId` (e.g. `center` → `jerusalem`, `tel_aviv` → `dan`). There is no `center` district in the registry.

`assess-signals.js --scope <scopeId>`. For any **regional** scope, filtering runs **after** the national score is computed so the report can include a `national_comparison` block (when source mix is comparable — see below).

`regionSignalFilter.js` attaches an explainable **`scopeDecision`** per signal (`isScopeRelevant`, backward-compat `isNorthRelevant` when target scope is `north`, plus `source`, `confidence`, `reasons`, `homeFrontDistricts`). Scope relevance is evaluated in order:

1. **Signal district** (`signal.district_id` via extract + [`signalDistrictId.js`](../business_modules/resilience/domain/services/signalDistrictId.js)): structured feeds carry an explicit district; legacy bundles without `district_id` fall back to `north` in code for structured source types. District tags merge with geo-derived districts in `deriveHomeFrontDistricts`.
2. **Resolved geo** (`signal.geo.kind === 'resolved'`): district match when `geo.classification.geoAreaTags` includes the target scope id (via `districtRelevanceFromResolvedGeo`; north PBO subregion logic preserved in `northRelevanceFromResolvedGeo`). Scope uses geo tags even when `usableForMetrics === false` (`confidence: low`); such signals are excluded from component metrics under epistemic v2.

Text keyword fallback was removed. News/radio/social signals without resolved geo matching the target district are excluded from regional scope. Non-north localities resolve via [`homefront-district-stubs.json`](../business_modules/geo/data/homefront-district-stubs.json) when `north-reference.json` has no match — see [GEOGRAPHIC-ANALYSIS.md § Non-north district stubs](./GEOGRAPHIC-ANALYSIS.md#non-north-district-stubs-homefront-district-stubsjson). Full geo contract: [`GEOGRAPHIC-ANALYSIS.md`](GEOGRAPHIC-ANALYSIS.md).

For regional scope, `total_articles` becomes `max(scopedArticleCount, 1)` so the coverage ratio reflects the regional corpus, not the national one.

### Phase 2 scope model (multi-district)

**Now:** Production and UI support six report scopes (national + five regional districts). `filterSignalsForScope(scopeId)` is generic; collection metadata decouples **ingestion theater** from **geo resolution**. Report filenames use `reportFilePrefix(scopeId)` — `resilience-report-{id}-*` for regional scopes; national history excludes all regional prefixes.

**Comparison guard (SMNI):** Regional reports attach `assessment.comparison_context` with source-mix comparability (`sourceMixIndex.js`). Headline `national_comparison` is populated only when `comparable: true` (default threshold on structured-share delta). Operator display surfaces incomparability warnings via `assessmentDisplayTier.js`.

Each `assess-signals` run writes `assessment.methodology` (phase label `multi_district_phase2`, scope-decision counts, `legacy_north_structured_source_types`, epistemic copy, optional advisory `tuning_proposal`). Full `scoring_model` manifest is on disk for analysts; operator API redaction keeps non-numeric `epistemic` and `scope_decision_summary` only.

### Operational runbook (phase 2)

| Goal | Command / path |
|------|----------------|
| National daily report | `npm run assess-signals -- --date YYYY-MM-DD --days 3 --scope national` |
| Regional daily report | `npm run assess-signals -- --date YYYY-MM-DD --days 3 --scope north\|south\|jerusalem\|dan\|haifa` |
| Advisory tanhK/certM from history | `npm run suggest-tuning` |
| Quick news-only run | `npm run extract-signals` + `npm run assess-signals` |
| Operator UI missing regional report | `GET /api/report/today?scope=<id>` → `hint: regional_requires_assess_signals` when no `resilience-report-{id}-*` file exists |

---

## 13) Reviewer overrides (removed in phase 1)

Reviewer score challenges (`challenge_score` / `dispute_evidence`, `/api/resilience/overrides`, drift override-rate) were **removed** for the population-behavior officer rollout. Headline scores now always reflect deterministic `scoreComponents()` output with no post-hoc blend. Legacy `daily_reports/overrides/*.jsonl` files on disk are ignored.

---

## 14) Drift dashboard, alerts, and history

`business_modules/resilience/infrastructure/reportHistoryReader.js` walks `daily_reports/`, picks the canonical run per date (highest `total_articles_analyzed`, tie-break on mtime) for the requested scope. `app/driftService.js` aggregates and `input/driftRoutes.js` exposes:

`GET /api/resilience/drift?scope=national|north|south|jerusalem|dan|haifa&days=30` (max 90).

Response:

- Per-component score series.
- **`signal_volume`** per day.
- **`source_type_share`** (stacked area: news / radio / field / pbo / …).
- `daily_mean_polarization`, `daily_mean_certainty` (numeric `certainty` from JSON when present, else bucket proxy from `confidence`).
- `daily_mean_erosion`, `daily_mean_chronic_z` (when chronic fields present in stored reports).
- **`alerts`** array:
  - `high_mean_polarization` fires on a **trailing-window mean** (default 3 days; `RESILIENCE_DRIFT_POLARIZATION_WINDOW`, clamped `[1, 14]`); threshold `RESILIENCE_DRIFT_ALERT_POLARIZATION` (default `0.7`). Payload includes `polarization_window_days`.
  - `long_term_degradation_warning`, `erosion_elevated` (chronic baseline; §9.6).

**UI today:** analyst Report cards show per-component **score sparklines** only (`DriftSparkline` in `ReportView.jsx`). The drift API still returns signal volume, polarization/certainty/erosion/chronic series, and `alerts`; a fuller dashboard (`ResilienceDriftPanel.jsx`) exists but is not wired into `MainApp.jsx` (legacy `#drift` URLs redirect to the Report section).

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
- Epistemic geo: `metrics_unsafe_geo_excluded_from_metrics`, `text_inferred_geo_excluded_from_metrics`.
- Data void: `digital_darkness_field_active`.
- Suppression: `ynet_flood_suppression_binding`.
- Contested thin band: `contested_thin_balanced`.
- LLM-only: satire-as-fact + opinion-as-fact.

`adversarial.test.js` asserts bounded expectations (`score_range`, `min_polarization`, `after_cross_source_dedup_count`, `verifier_should_pass`, …). The pipeline is asserted, not the LLM — so this catches regressions in dedup, capping, and scoring math regardless of model behaviour.

### 15.3 Calibration

- `npm run suggest-tuning` (or `node business_modules/resilience/tuning/scripts/suggestComponentTuning.js`) — scans national `daily_reports/resilience-report-*.json`, fits per-component (`tanhK`, `certM`) by inverting the scoring math row-by-row and taking the median (B5 / Tier 7). Output is **advisory only**: `COMPONENT_TUNING` defaults stay in `behaviorSignals.js` untouched until a human edits them. Pass `--diff` to print only the components whose proposal moves by more than ±0.05 from current.
  ```bash
  npm run suggest-tuning              # current and proposed for every component
  npm run suggest-tuning -- --diff    # diff only (suppresses unchanged rows)
  ```
- `business_modules/resilience/domain/services/signalWeightsFit.js` — **shadow RGR** when ≥30 report records exist (`fitSignalWeightsRidgeMock` returns advisory payload; production weights unchanged until Tier 5 labeled scores). Optional overlay: `tuning/shadow-weights.json`.
- **`calibrationPenalty.js`** — `score_calibrated` shrinks headline scores toward 5.5 using `calibration_trust` from validation record count + expert label fill rate.
- **`weightSensitivity.js`** — Tier-3-gated shadow ±12% perturbation bands on `SIGNAL_TO_COMPONENTS`; analyst field `weight_sensitivity.fragile` when `band_width ≥ 2`.
- **OOV / learning capture** (extraction hooks, default on via `RESILIENCE_OOV_CAPTURE`):
  - `daily_reports/oov-capture-{date}.jsonl` — unknown `signal_type`, self-check uncertain, zero-signal articles.
  - Optional `RESILIENCE_RESIDUAL_CAPTURE=1` — open-vocab residual observations for zero-signal articles (`learningCapture.js`).
  - `assessment.oov_capture_count` on each assess run; validation review queue reason `oov_suggested`.
  - Cluster digest: `validation/scripts/oovClusterDigest.js`.
- **Catalog learning** (`business_modules/catalogLearning/`):
  - `npm run catalog-learning:gap-report` — clusters JSONL captures (prefix or embedding when `OPENAI_API_KEY` / vector index enabled) → `daily_reports/catalog-gap-report.md`.
  - `ILearningCapturePort` + `learningCaptureFsAdapter`; kinds shared via `cross-cut-modules/learningCapture/`.
- **Model card:** `docs/MODEL-CARD.md` — operator instruments, epistemic tiers, feature flags, known limits.

### 15.4 Live-LLM CI

`.github/workflows/resilience-live-llm.yml` — `workflow_dispatch` + weekly schedule; runs `tests/business_modules/resilience/adversarial.test.js` with `RESILIENCE_LIVE_LLM=1`. Job-level secret gating uses an explicit `steps.gate.outputs.has_key` flag.

### 15.5 Validation collection (operational calibration)

`business_modules/resilience/validation/` — runs automatically at the end of every **`assess-signals.js`** run. Purpose: shadow/active collection of assessment snapshots and expert review queues during peacetime and crisis, tracking construct-validity maturity tiers.

| Item | Detail |
|------|--------|
| Config | `business_modules/resilience/validation/validation-config.json` — phase, collection toggles, review thresholds, acceptance criteria |
| Phase CLI | `npm run validation:status`, `npm run validation:set-phase -- elevated` |
| Service | `validation/app/validationCollectionService.js` → `collectAfterAssessment()` |
| Artifacts | `business_modules/resilience/validation/artifacts/records/{date}-{scope}.json`, `review-queue/{date}-{scope}.jsonl`, `phase-log/phase-changes.jsonl` |

**Operational phases:** `baseline` (default shadow collection) → `elevated` → `acute`. Auto-elevation from signal volume is **advisory only** (`auto_elevation.advisory_only: true`) — never auto-applied.

**Review queue:** up to 15 flagged articles/day (high delta significance, counterfactual leverage, polarization, low extraction confidence, OOV suggested). **Analyst UI:** `ValidationReviewPanel` on **`analyst-site`** (`AnalystApp.jsx`, `showValidationReview`). **Storage:** SQLite review queue default (`ValidationReviewSqliteStore` when `VALIDATION_REVIEW_SQLITE !== '0'`) plus JSONL export mirrors under `validation/artifacts/review-queue/`.

**Acceptance tiers** (from config): Tier 1 = CI golden (`micro_F1 ≥ 0.55`, `macro_κ ≥ 0.40` in `golden-corpus.test.js`) + adversarial; Tier 2 = operational extraction targets (`micro_f1_min: 0.65`, `macro_kappa_min: 0.5` in config); Tier 3 = 30+ daily records → `npm run suggest-tuning`; Tier 4 = expert labels (Spearman ≥ 0.6); Tier 5 = shadow ridge weight fit (`signalWeightsFit.js`).

---

## 16) Operational guardrails (cost, retries, secrets)

`cross-cut-modules/budget/`:

- **Daily budget cap** via `checkDailyBudget()`. Process exits with a partial usage report if exceeded.
- **`createCostTracker({ label })`** wraps every LLM call with token + cost accounting. Rolls up into `cost-log.jsonl` at run end.
- Default per-run **cost cap**: ~$3.00. Typical news-only run: ~$0.18–0.26 (Haiku pre-filter ~$0.01; Haiku extraction ~$0.07–0.10; Sonnet narrative ~$0.10–0.15).
- **Stage instrumentation (C9)**: `applyEvidenceVerifier` and `runSelfCheck` emit per-stage stats events (`{ kept, dropped, input, reason_counts }`) into the cost tracker. `appendCostLog` aggregates them under a `stages` block in `cost-log.jsonl`, so we can later inspect per-stage kill rates without rerunning the pipeline (lets us decide whether the self-check earns its tokens).
- **HTTP + interactive spend**: Chat, validation explain/agent, and report-build also append to the same log (`http:*` scripts) so `DAILY_BUDGET_USD` applies to UI traffic. Narrative relation judge is batched per component by default. See [COST_CONTROLS.md](./COST_CONTROLS.md).
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
| `X_BEARER_TOKEN` | X API v2 for social OSINT gather/topic fetch |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION` | Telegram MTProto for social OSINT |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | Search trends live fetch (Trends tab) |
| `TRENDS_DEMO_MODE` | `1` = synthetic trends data, no live API |
| `RESILIENCE_ANALYST_EMAILS` | Env override: comma-separated emails for analyst tier (primary gate: `config/userAccess.json`) |
| `RESILIENCE_MAINTAINER_EMAILS` | Env override for maintainer tier |
| `RESILIENCE_NARRATIVE_INCLUDE_SCORES` | Default `false` — include 1–10 lines in narrative LLM prompt when `true` |
| `RESILIENCE_EMBEDDING_VERIFY` | `0` to disable embedding rescue |
| `RESILIENCE_EMBEDDING_SIM_THRESHOLD` | Default `0.82` |
| `RESILIENCE_OUTLET_PRIORS_PATH` | Test path override for outlet priors |
| `RESILIENCE_DELTA_MIN_HISTORY` | Min non-null baseline points for delta-significance z; default `5` |
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

This loads up to 3 days each of news/radio/field/pbo/pbo_regional bundles within `{2026-05-04, 2026-05-03, 2026-05-02}`, applies temporal weights `{1.0, 0.85, 0.70}`, scope-filters signals to the north (always-north source types are kept unconditionally), runs `scoreComponents`, generates the narrative with a `national_comparison` block, and writes `daily_reports/resilience-report-north-2026-05-04-HHMM.{md,json}`.

### 17.3 Slash command (recommended)

```
/8comp
```

`.claude/commands/8comp.md` runs steps 0–7 above end-to-end; `8comp-3.md` and `8comp-3-north.md` are 3-day window variants; `8comp-7.md` and `8comp-7-north.md` are 14-day (two-week) variants.

**Social OSINT (X + Telegram) for north 3-day runs:** `/8comp-3-north` calls `npm run social-media:gather-daily -- --date <target> --days 3 --north --execute`, which writes population-behavior findings into `business_modules/social_media/data/signals-social-<date>.json`, runs `social-media:treat`, and feeds both the **Social media → Daily feed** UI (via `findings[]`) and `assess-signals.js` (via `signals[]` when `pipeline-config.json` has `social` enabled).

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

### 18.3 Read the narrative

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

> **Recently shipped (critique remediation + operations bundle):** epistemic metrics/context partition (§8.9), Option C operator abstention (§8.11), data void index (§9.7), suppression transparency (§8.10), dual chronic baseline (§9.6), OOV capture + review queue reasons, macro context bucket, drift erosion/chronic UI, golden + adversarial suites (§15), operator/analyst display tiers, methodology telemetry. Reviewer overrides removed (§13). **Core tanhK/certM/weights remain author-set until Tier 3–5 gates (§19.2).**

### 19.1 Requires labels at human scale

- **Expand golden corpus to 80–100 hand-reviewed articles.** The seeded corpus in `tests/fixtures/resilience-golden/corpus.jsonl` is agent-curated from production extractions (~30 records). It catches snapshot drift but not LLM truth-quality. Replacing the snapshot baseline with human-checked labels raises the bar from "model regression" to "extraction quality".
- **Per-outlet reliability priors learned from data.** Outlet-level reputation learned from calibration + agreement data, replacing the current author-supplied per-`source_type` reliability multiplier in `config/resilience-outlet-priors.json`.

### 19.2 Requires score history (collected automatically; rerun in 30 days)

- **Per-component K/m calibration (full 4c).** The `tanhK_c` / `certM_c` values in §8.3 are author-set heuristics. Once 30+ days of `daily_reports/resilience-report-*.json` exist, fit `K`/`m` per component to actual evidence-mass distributions.
- **Data-driven weight tuning (T5).** Ridge regression with sign constraints on `SIGNAL_TO_COMPONENTS` weights against expert-labeled per-component scores. Stub: `business_modules/resilience/domain/services/signalWeightsFit.js` (`fitSignalWeightsRidgeMock` returns `null` until labelled data exists).

### 19.3 Requires an additional model run

- **Two-model agreement at population scale (E3 full).** §6.7 ships an *opt-in* dual-pass extraction (`RESILIENCE_SECOND_EXTRACT=1`) that flags reproduced signals with `_dual_pass_agreement` and applies a small evidence boost. Doubling extraction cost in the default path is deferred until quality plateau is hit on the single-model path.

---

## 20) Appendix — component IDs and UI labels

Stable IDs (used in JSON, code, and i18n keys) and their English labels from `client/src/i18n/translations.js`:

<!-- docs-sync:BEGIN appendix-ui-labels -->

> **Auto-synced** from `client/src/i18n/translations.js (en + he)` on 2026-06-22. Do not edit between sync markers.

| ID | English UI label | Hebrew UI label |
|---|---|---|
| `narrative` | narrative | נרטיב |
| `information_communication` | information & communication | מידע ותקשורת |
| `lifesaving_behavior` | lifesaving behavior | התנהגות הצלת חיים |
| `functional_continuity` | functional continuity | המשכיות תפקודית |
| `community_capital` | community capital | הון קהילתי |
| `leadership` | leadership | מנהיגות |
| `belonging_solidarity` | belonging & solidarity | שייכות וסולידריות |
| `wellbeing_at_risk` | wellbeing at risk | רווחה בסיכון |

<!-- docs-sync:END appendix-ui-labels -->

Hebrew UI strings are defined in parallel under the same `comp.*` keys in `translations.js`.

---

## 21) Module / file map

```
business_modules/
├── news-sites/                                    # Source 1 — News
│   ├── input/extract-homefront-articles.js        # CLI: fetch + LLM pre-filter → articles-homefront.md
│   ├── input/newsSitesRoutes.js                   # GET /api/news-sites/*
│   ├── app/extractHomefrontArticles.js            # Orchestration
│   ├── app/newsSitesService.js                    # Ingest dashboard + daily feed
│   ├── domain/services/homefrontKeywords.js       # Multilingual keyword list (social_media)
│   ├── domain/mainNewsFilter.js                   # Main-news URL filter
│   └── infrastructure/adapters/newsApi*Adapter.js # Per-outlet NewsAPI.ai adapters
│
├── audio/                                         # Source 2 — Radio / audio
│   ├── input/audio-to-md.js                       # CLI: Whisper → articles-audio-*.md
│   ├── input/radioRoutes.js                       # GET /api/radio/*
│   ├── app/audioIngestService.js
│   ├── app/audioEvidenceIngestService.js          # Transcript feed for Radio tab
│   ├── app/audioTranscriptContextualizer.js
│   └── infrastructure/adapters/openaiTranscriptionAdapter.js
│
├── whatsapp/                                      # Source 3 — WhatsApp
│   ├── input/whatsapp-to-md.js                    # CLI: export → articles-whatsapp-*.md
│   ├── input/webhook-routes.js                    # Live ingest (group + DM)
│   ├── app/whatsappIngestService.js               # DM adaptive chatbot + group routing
│   ├── app/whatsappResilienceAnalyzer.js
│   └── domain/conversation/                       # gapEngine, state machine, outbound messages
│
├── pbo_report_review/                             # Municipal PBO completeness (pipeline step 7b)
│   ├── input/runMunicipalPboReview.js           # Daily gap check + Resend follow-up
│   ├── input/pboReviewRoutes.js                 # GET/POST /api/pbo/municipal-reviews/*
│   └── app/pboReportReviewService.js
│
├── video/                                         # YouTube/video evidence ingest
│   └── app/videoGrabService.js                  # POST /api/video/* (api/routes/reportRoutes.js)
│
├── translation/                                   # Report + social OSINT batch translation
│   └── app/translationService.js                # POST /api/translate (api/routes/reportRoutes.js)
│
├── scheduled_stream_capture/                        # Radio stream capture (FFmpeg schedule)
│   └── infrastructure/scheduledStreamCaptureJobStore.js
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
├── pool/                                          # Naftali questionnaire + education sessions (Pools tab)
│   ├── input/extract-naftali-signals.js           # Excel → signals-naftali-{week}.json
│   ├── app/naftaliService.js
│   └── input/poolRoutes.js
├── social_media/                                  # Source 8 — Social OSINT (X + Telegram)
│   ├── input/socialMediaInput.js                  # gather-daily | treat | init
│   ├── input/socialMediaRoutes.js                 # /api/social-media/*
│   ├── app/socialMediaDailyGatherService.js       # X + Telegram daily pipeline
│   ├── app/socialMediaTreatmentService.js         # findings → signals[]
│   ├── app/socialMediaTopicFetchService.js        # On-demand topic search
│   └── data/signals-social-{date}.json            # OSINT bundle
│
├── search_trends/                                 # Trends tab (not in assess pipeline)
│   ├── input/searchTrendsRoutes.js              # /api/search-trends/*
│   ├── app/searchTrendsService.js
│   └── data/cache/dashboard-{district}-{days}d.json
│
├── geo/                                           # Deterministic locality resolve (no direct imports from resilience)
│   ├── data/north-reference.json, north-border.json, homefront-district-stubs.json
│   ├── app/geoService.js
│   ├── domain/services/resolveLocalityMatch.js, geoQualityPolicy.js, homefrontDistrictStubs.js
│   └── input/geoRoutes.js                       # GET /api/geo/resolve
│
├── catalogLearning/                               # OOV cluster gap reports (analyst)
│   ├── input/generate-gap-report.js             # npm run catalog-learning:gap-report
│   ├── app/catalogLearningService.js
│   └── infrastructure/adapters/learningCaptureFsAdapter.js
│
├── chat/                                          # Evidence-aware assistant (desktop popup)
│   └── infrastructure/chatStore.js              # Session persistence (SQLite)
│
├── report_build/                                  # Write Report popup
│   ├── input/reportBuildRoutes.js               # POST /api/report-build/start|turn|suggest|confirm|cancel
│   └── app/reportBuildService.js
│
├── mailing/                                       # Settings popup — digest preferences
│   ├── input/mailingRoutes.js                   # GET /api/mail/*
│   └── app/mailingService.js
│
├── resilience/                                    # The brain (+ field survey Excel → MD/JSON under app/survey*.js, input/analyzeSurveyInput.js)
    ├── domain/
    │   ├── resilienceComponents.js                # 8 component definitions, principles, manifestations
    │   ├── ports/IResilienceLlmPort.js
    │   ├── ports/IResilienceReportWriterPort.js
    │   └── services/
    │       ├── behaviorSignals.js                 # SIGNAL_CATALOG, SIGNAL_TO_COMPONENTS, scoreComponents()
    │       ├── componentFacets.js                 # Per-component facet decomposition
    │       ├── extractionMetrics.js               # P/R/F1 + Cohen's κ for golden corpus
    │       ├── outletReliabilityPriors.js         # Per-outlet reliability multiplier
    │       ├── regionSignalFilter.js              # National + five regional district scope filter
    │       ├── resilienceBatchValidation.js
    │       ├── resilienceScoring.js               # Re-export of scoreComponents
    │       ├── assessmentDisplayTier.js           # Operator vs analyst redaction
    │       ├── assessmentMethodology.js           # Methodology block + operator view
    │       ├── dataVoidIndex.js                   # Digital darkness / information vacuum
    │       ├── oovCapture.js                      # OOV + learning-capture JSONL buffer
    │       ├── pipelineStageTelemetry.js          # Extraction/assess stage summaries
    │       └── signalWeightsFit.js                # T5 shadow RGR weight fit
    ├── app/
    │   ├── surveyEvaluator.js                     # Field survey — Haiku qualitative pass
    │   ├── surveyReportWriter.js                  # Field survey — MD/JSON output
    │   ├── contentBatchFromMdArticles.js
    │   ├── driftService.js                        # /api/resilience/drift aggregation
    │   ├── resilienceAnalysisService.js           # Evidence-submit auxiliary path (api/routes/evidenceRoutes.js)
    │   └── runResilienceAnalysis.js               # Shared news/audio batch helper (not daily pipeline CLI)
    ├── infrastructure/
    │   ├── claudeExtraction.js                    # Haiku signal extraction
    │   ├── claudeNarratives.js                    # Sonnet narrative synthesis
    │   ├── claudeEvaluator.js                     # Barrel re-export of extraction + narratives
    │   ├── dualModelExtract.js                    # E3 dual-pass merge + agreement boost
    │   ├── embeddingEvidenceVerifier.js           # N8 embedding rescue
    │   ├── extractionPasses.js                    # Multipass domain groups + self-check prompt
    │   ├── learningCapture.js                     # Residual / zero-signal / uncertain capture hooks
    │   ├── mdReportsLoader.js                     # Parse articles-*.md → article objects
    │   ├── reportHistoryReader.js                 # Walks daily_reports/, picks canonical per-date run
    │   ├── reportWriter.js                        # Markdown + JSON output
    │   ├── signalVerification.js                  # n-gram containment + within-batch dedup
    │   └── adapters/
    │       ├── anthropicResilienceLlmAdapter.js
    │       └── surveyExcelLoader.js               # Field survey — Google Forms Excel → grouped answers
    └── input/
        ├── analyzeSurveyInput.js                  # Survey CLI logic
        ├── backfillReportBriefMd.js               # Regenerate -brief.md from report JSON
        ├── assess-signals.js                      # Stage-2 CLI: combine signals + assess (+ validation)
        ├── assessSignalsHelpers.js                # crossSourceDedup, EWMA, delta-channel
        ├── driftRoutes.js                         # /api/resilience/drift
        └── extract-signals.js                     # Stage-1 CLI: extract per source
    └── validation/                                # Post-assess calibration collection
        ├── validation-config.json
        ├── app/validationCollectionService.js, validationReviewService.js
        ├── input/validationReviewRoutes.js        # review queue + context + explain + agent
        ├── domain/validationRecordBuilder.js
        ├── scripts/validationStatus.js            # npm run validation:status
        └── artifacts/records|review-queue|phase-log/

daily_reports/
├── resilience-report-{date}-{HHMM}.{md,json}
├── resilience-report-{date}-{HHMM}-brief.md      # Operator brief (no scores)
├── resilience-report-{scopeId}-{date}-{HHMM}.{md,json}  # Regional scopes
├── oov-capture-{date}.jsonl                     # Learning capture (when enabled)
└── catalog-gap-report.md                          # catalog-learning:gap-report (+ nearest_catalog RAG)

cross-cut-modules/retrieval/
├── analystRetrieval.js                            # validation / catalog / PBO hybrid helpers
├── catalogIndexWriter.js                          # SIGNAL_CATALOG → namespace=catalog
└── (Tier 1–2: chunkStore, pipelineRetrieval, storyClusterIndex)

business_modules/pbo_report_review/
├── app/pboHistoricalSearchService.js
└── input/pboReviewRoutes.js                     # GET /api/pbo/historical-search

signals/
├── signals-news-{date}.json
├── signals-radio-{date}.json
├── signals-whatsapp-{date}.json
├── signals-pbo-{date}.json
├── signals-pbo_regional-{date}.json
└── signals-naftali-{week-end-date}.json

business_modules/social_media/data/
└── signals-social-{date}.json                     # Social OSINT (findings + signals[])

business_modules/visits/data/signals/
└── signals-field-{date}.json

config/
└── resilience-outlet-priors.json                  # Optional per-outlet reliability prior

pipeline-config.json                                # Source enable/disable toggles

cross-cut-modules/geo/
├── createGeoWiring.js                              # Composition factory (overrides + unknown sinks)
├── enrichSignalsWithGeo.js                         # Pipeline geo attach at extract/assess
└── geoEnvelopeAccess.js                            # v3 nested envelope read helpers

api/routes/
├── chatRoutes.js                                   # Session CRUD + POST /api/chat + confirm-action
└── evidenceRoutes.js                               # POST /api/evidence-submit (auxiliary analysis)

.claude/commands/
├── 8comp.md                                       # Full daily pipeline (national)
├── 8comp-3.md                                     # 3-day window
├── 8comp-3-north.md                               # 3-day window, north scope
├── 8comp-7.md                                     # 14-day (two-week) window
├── 8comp-7-north.md                               # 14-day window, north scope
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
- **High-salience bypass** — when mass is below 1.5 but a verified critical single signal dominates, may set `salience_critical` (operator-visible alert) and optionally `floor_bypassed` (skip lower clamp when raw &lt; 3). See `highSalienceBypass.js`.
- **`floor_clamped`** — boolean flag emitted on a component whenever the min-mass floor actually constrained the headline (the unconstrained score would have lain outside `[3, 8]`). Surfaced in the UI as *"thin evidence"*.
- **`salience_critical`** — verified high-stakes single signal on a thin-evidence day; operator instrument `critical_single_signal` shows the score with an alert.
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
- **`evacuation_displacement`** — continuity-domain negative signal type for residents evacuated, displaced, or unable to return home; spills into `wellbeing_at_risk` and `belonging_solidarity`.
- **`routine_disruption`** — continuity-domain negative signal type for civilian daily-routine disruption (commuting, shopping, leisure, social rhythms). Distinct from `service_disruption` (institutions) and `economic_disruption` (employment / business).

---

## 23) Disclaimer

This document describes **the software's implemented model**, not a legal or clinical standard. The underlying operational framework is described in-code as aligned with Home Front Command resilience assessment methodology; local procedures and professional judgment still apply.
