# Signal Review: north-1-data-2026-04-02-produced-2026-08-14T0913Z
Date: 2026-04-02 | Scope: north | Signals: 260 | Articles: 54

## Executive Summary

Extraction is mechanically healthy — zero unregistered signal types, every one of the 120 rendered top-contributors sits on a `primary` routing edge, and 243/260 signals are `grounded`. The quality problems are all one layer up, in what the grounded signals are allowed to imply. Three findings dominate. (1) **Visits evidence is systematically under-grounded**: all 59 visits signals carry an appended English gloss (`ממ״דים תקועים בבנייה לאורך שנים ( mamads stuck in construction for years)`), and 27 of them (46%) fail plain containment — 14 rescued by entailment, 10 demoted `low_similarity`, 3 `verification_failed_critical`. Signals with a gloss fail grounding at 20.7% vs 2.0% without one. Every `low_similarity` row in the whole report is a visits row. (2) **The two components most exposed to self-report bias are the two most one-sidedly positive**: `information_communication` is 93% PBO and 14 positive / 1 negative, and its single hard negative (`early_warning_system_failure`) was demoted out of the narrative; `leadership` is 76% PBO, 30/4 positive, and carries 46 inferred edges (40 positive / 6 negative) against only 34 primary signals. The municipality is both the subject and the reporter. (3) **No cross-outlet event dedup**: one Kiryat Shmona casualty event produced 4 `harm_to_population` signals and one Nahariya kindergarten strike produced 5 `infrastructure_damage_acute` signals, which between them are the entire visible negative top of `wellbeing_at_risk` and `functional_continuity`.

Most actionable single fix: strip the translation gloss from visits evidence before grounding verification. It is a string-preparation bug, not a judgement problem, and it is currently suppressing exactly the class of evidence the report most needs — shelter absence, zero warning time, responder burnout.

## Per-Component Evidence Quality

### Narrative (confidence: high, signals: 18, sufficiency: adequate, balance: mixed)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| resilience_narrative_positive ×9 | "האוכלוסיה משדרת נרטיב חיובי", "התושבים מפגינים חוסן מרשים" | ✓ | On-construct, all `narrative_frame` role |
| future_orientation_despair | "קיימת שחיקה בקרב התושבים" (קרית שמונה) | ✓ | Strong, and the only despair row |
| resilience_narrative_negative ×2 | "הנרטיב הוא של חוסן שחוק... העתיד אפור" (מגאר) | ✓ | Clearest negative in the component |
| future_orientation_hope ×2 | "מחפשים עוגנים של תקווה בתוך חוסר ודאות" | ✓ | מגאר reports hope and worn-resilience in one breath — correctly split |
| resilience_narrative_positive (מג'דל שמס) | "יש יותר הישמעות להנחיות ויישומן" | ~ | This is compliance behaviour, not narrative; belongs in `lifesaving_behavior` |
| resilience_narrative_positive (עראבה) | "יש רציפות תפקודית בקרב התושבים" | ~ | Literally functional continuity; also extracted as `adaptive_practice` for the same municipality — one sentence, two components |

**Weak links:** the two `resilience_narrative_positive` rows above are behaviour/continuity statements wearing a narrative label. `concentration_warning` fires at pbo 0.83; `shared_primary_articles` share is 1.00 — no article contributes to narrative alone.
**Gaps:** no citizen voice. 15/18 rows are PBO officers characterising their own residents' narrative in the third person; zero `direct_quote_named_person`. A "narrative" component with no verbatim speech is an inference about a narrative, not an observation of one.

### Information, Communication, and Sharing (confidence: medium, signals: 15, sufficiency: adequate, balance: mixed)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| information_clarity ×6 | "אין פערי מידע", "אין פייק ניוז", "קיים מוקד מידע" | ~ | Grounded, but every row is the authority describing its own channel |
| trusted_information_source ×2 | "פיקוד עורף ואמצעי המדיה... הן המקור הראשי" | ✓ | Names the channel, verifiable |
| information_actionable_effective ×3 | "מדי שבוע יוצאים סרטוני המחשה", "הנחיות בכפל... מלווה בסרטונים" | ~ | Describes output produced, not effect achieved — mislabels transmission as effectiveness |
| rumor_correction | "למידע שגוי תמיד יש תיקון והודעת אמת על כל פייק ניוז" | ~ | "תמיד" is an unfalsifiable self-claim |
| information_inclusivity_present | "בשפה הערבית" | ✓ | Two-word fragment but factual and checkable |

**Weak links:** `information_actionable_effective` is being used for *volume and format of output*, not for evidence that residents acted on it. All three rows are from ראמה/עראבה — two municipalities carry the whole "effectiveness" reading.
**Gaps:** this is the most compromised component in the report. `concentration_warning` = pbo 0.93; 14 of 15 rows are the communicating institution grading its own communication. The one independent negative — `early_warning_system_failure`, "זמן התגוננות אפס", conf 0.80 from a visits pair — was demoted `unverified_critical` and `excluded_from_narrative: true`. A component that keeps every self-congratulatory row and drops its only zero-warning-time row is reporting a filtered world. `confidence: medium` is the right call but understates it.

### Effective Life-Saving Behavior (confidence: high, signals: 50, sufficiency: adequate, balance: contested)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| protective_infrastructure_absent ×5 | "כארבעים אחוזים מהמבנים... ללא מיגון תקני כלל" (טבריה), "אין מספיק מקלטים" (שעב) | ✓ | Best hard evidence in the report; quantified in the טבריה case |
| non_compliance_ignore_guidelines ×2 | "רכבים המשיכו בנסיעתם, אנשים הלכו ברחובות" (צפת) | ✓ | Observed behaviour, dated, specific |
| risk_exposure_behavior ×2 | "ממשיכים בנסיעה בזמן אזעקה" (מגאר) | ✓ | Observed |
| compliance_follow_instructions ×4 | "נשמעים להנחיות פקע\"ר", "התושבים ממושמעים מאוד" | ~ | Officer characterisation, no observed instance behind any of them |
| compliance_partial | "רק כ־70 אחוז נשמעים להם" (בוקעאתא) | ✓ | Quantified and self-critical — the most credible positive-side row |
| near_miss_reported | "שנפלו שברי יירוטים בכפר" | ~ | conf 0.60, describes debris fall, not a near miss to a person |
| protective_infrastructure_absent (סלמאן שנאן) | "חדרי ביטחון אינם ממ״ד" | ~ | `entailment_rescue`, and it is a public-education need, not an infrastructure absence |

**Weak links:** the positive side is 4 near-identical officer assertions of compliance versus a negative side of dated, observed, sometimes quantified non-compliance. `balance: contested` is technically right (26/24) but the two sides are not the same evidential grade. The 16 inferred edges are **all positive, zero negative** — spillover is loading only one way, making the component read more balanced than its primary evidence is.
**Gaps:** 4 rows demoted, including 2 `protective_infrastructure_absent` and 1 `early_warning_system_failure`, all visits-sourced with glosses. The component's strongest evidence class is also its most-suppressed one.

### Functional Continuity (confidence: high, signals: 30, sufficiency: adequate, balance: mixed)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| infrastructure_damage_acute ×4 (top) | Nahariya kindergarten — inn, walla, israelnationalnews, kipa | ✗ | **One event, four signals.** Not four independent observations |
| routine_disruption ×2 | "כל האירועים של החגים הנוצריים בוטלו" (ראמה) | ✓ | Concrete and dated |
| adaptive_practice ×4 | "התושבים ממשיכים לפעול בשגרה לצד חירום" | ~ | Boilerplate; near-identical wording across קצרין/עראבה/שעב/ראמה |
| service_disruption ×3 | "רמת השירותים הרפואיים נפגעה... טיפות חלב ובריאות הנפש" | ✓ | Specific services named — strongest rows here |
| service_continuity | "העירייה... נתנה מענה... לתושבים שביתם נפגע" | ~ | `ordered_subsequence` grounding on a heavily elided quote |
| educational_continuity | "יש פתיחת קייטנות" (שפרעם) | ✓ | Small but checkable |

**Weak links:** the top 4 negative contributors are one kindergarten strike counted four times, which is what `distinct_article_count: 23` is quietly built on. `inferred_context` is 40 edges (30 positive / 10 negative) against 30 primary signals — the majority of this component's evidence pool is spillover, and it leans 3:1 positive while the primary evidence leans 23:7 negative. The rendered reading and the underlying evidence point opposite ways.
**Gaps:** 5 rows demoted `weak`, four of them visits-gloss `low_similarity` covering exactly the coordination question (`coordination_failure`: "ככל הנראה אין צח״י"). Whether a locality has a functioning צח״י is central to functional continuity and it is being dropped on a string-match failure.

### Community Capital and Resources (confidence: high, signals: 89, sufficiency: adequate, balance: mixed)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| wellbeing_support_provided ×3 | "משרד הבריאות מרחיב את המענה הרפואי בקריית שמונה... 24/7" | ✓ | `named_institutional_fact`, conf 0.92 — best-grounded row in the report |
| wellbeing_support_accessed ×2 | "מחלקת הרווחה והעו״ס נמצאים בקשר רציף עם האוכלוסיה" | ✗ | Describes the department reaching out = *provided*, not *accessed*. See spot-check #4 — same error |
| coordination_success ×3 | "מנכ\"ל המועצה מקיים מדי יום הערכת מצב" | ✓ | Concrete cadence |
| adaptive_practice ×4 | identical rows to Functional Continuity | ~ | Same four sentences scored into two components |
| community_volunteering ×2 | "מתנדבי הנוער... מסייעים לקשישים בהבאת תרופות" (טבריה) | ✓ | Named activity, named beneficiary group |
| resource_mobilization | "הרשות פועלת למיצוי משאבי הקהילה... מערך מתנדבים" | ~ | Authority intent, no delivered quantity |

**Weak links:** 89 signals and 78/11 positive with **no `concentration_warning`** — because the count is spread across 40+ PBO municipalities, no single `article_source` crosses threshold. But 61/89 are PBO and 27 are visits: 99% of the component is field/self-report and 1 row is independent news. The threshold is measuring the wrong layer here.
**Gaps:** 7 demoted `weak`, all visits-gloss, including both `coordination_failure` and `coordination_success` from the same locality pair — the component keeps the diffuse positives and loses the sharp bidirectional ones.

### Leadership (confidence: high, signals: 34, sufficiency: adequate, balance: mixed)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| institutional_trust ×4 | "המנהיגות המקומית נתפסת כמקור אמין ומרגיע" (עראבה) | ~ | Leadership asserting that it is trusted |
| leadership_clear_guidance ×5 | "מעביר הנחיות בזמן אמת", "מעודדת את האוכלוסיה להישמעות" | ~ | Activity descriptions; no row shows guidance landing |
| leadership_visible_presence ×4 | "ראש הרשות מהווה דמות חיובית ומשפיעה" (ע'ג'ר) | ~ | Self-assessment of own influence |
| coordination_success | "שיתופי הפעולה בין ההנהגה לבין התושבים ניכר" (עין קנייא) | ~ | Same |
| institutional_trust (קצרין) | "התושבים... מבינים שמילוי ההנחיות של פקע\"ר מציל חיים" | ~ | About HFC trust, routed to local leadership |

**Weak links:** all 15 rendered contributors are positive, and 13 of 15 are the leadership describing itself. **The presence gate is a surface bug**: `presence_gate: {rule_id: critical_non_compliance_ignore_guidelines, signal_type: non_compliance_ignore_guidelines}` fired, but routing gives leadership only an `inferred` edge for that type, both source signals come from a single locality (צפת), and neither appears anywhere in the 15 contributors. A reader sees a uniformly positive leadership panel with a critical gate flag and no visible cause. `inferred_context` = 46 edges (40 positive / 6 negative) against 34 primary signals — this is the most spillover-dependent and most one-directional component in the report.
**Gaps:** 7 demoted, including both `leadership_visible_presence` rows sourced from visits (independent observers) — so the only outside observations of leadership presence were dropped while the self-reports were kept. That is the concentration problem and the grounding problem compounding in the same direction.

### Belonging and Solidarity (confidence: high, signals: 46, sufficiency: adequate, balance: mixed)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| inter_group_trust ×5 | "אין קבוצות ממודרות" (ע'ג'ר), "סולידריות בצורה טובה מאוד" (עילבון) | ✓ | On-construct; the ע'ג'ר "no segregated groups" row is the sharpest |
| interpersonal_trust ×3 | "כולם משפחה אחת" (בוקעאתא) | ✓ | On-construct |
| community_volunteering ×4 | "מתנדבי הנוער... סיוע לקשישים" | ✓ | Also primary to community_capital — correct dual-primary, not spillover |
| solidarity_help_others ×3 | "קיימות קבוצות של עזרה הדדית בדגש על אוכלוסיות מוחלשות" | ✓ | Named target group |

**Weak links:** cleanest component in the report — 6 inferred edges only, no `concentration_warning`, no critical demotions. The one structural concern is 43/3 positive with zero rows on exclusion, tension between communities, or evacuee/host friction, across a mixed Jewish/Arab/Druze/Circassian northern sample during an active rocket campaign. Absence of negative evidence here is more likely an extraction blind spot than a finding.
**Gaps:** no `social_tension`-class evidence of any kind. The spot-check (#7) shows the reverse error too — a pure cohesion description from ראמה typed as `solidarity_help_others`, while the near-identical ע'ג'ר phrase was typed `inter_group_trust`. State-vs-act is not being applied consistently.

### Physical and Mental Wellbeing, At-Risk Populations (confidence: high, signals: 42, sufficiency: adequate, balance: mixed)

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| harm_to_population ×3 (top) | Kiryat Shmona, 85yo + 34yo lightly injured — ynet, israelnationalnews, kipa | ✗ | **One casualty event, three visible signals** (plus 2 more demoted) |
| protective_infrastructure_absent ×5 | "כארבעים אחוזים מהמבנים... ללא מיגון" (טבריה) | ✓ | Correct dual-primary with lifesaving_behavior |
| vulnerable_population_mapping ×3 | "מיפוי של אוכלוסיות סיכון... (קשישים, בעלי מוגבלויות)" (טבריה) | ✓ | Best positive rows here — capacity, checkable |
| information_inclusivity_present | "בשפה הערבית" | ~ | Arabic-language messaging routed into at-risk wellbeing is a stretch |
| future_orientation_despair | "קיימת שחיקה בקרב התושבים" | ✓ | Also primary to narrative |
| resource_shortage | "קבוצת המתנדבים דרושה בניה מחדש" (יבנאל) | ~ | Volunteer-corps rebuild need, not a wellbeing resource shortage |
| near_miss_reported | "שנפלו שברי יירוטים בכפר" | ~ | conf 0.60 |

**Weak links:** 7/35 positive/negative looks like a collapsing component, but `mirror_context` shows 32 mirror signals (`wellbeing_support_accessed` ×18, `resource_mobilization` ×14) anchored in `community_capital` — the entire support-side counterweight is booked to another component. The negative skew is substantially an accounting artifact and the mirror annotation is doing its job; a reader who skips it will misread the component. Then 7 rows demoted, 4 of them `unverified_critical` including both remaining `harm_to_population` news rows and both visits `protective_infrastructure_absent` rows.
**Gaps:** **the same fact was graded two opposite ways.** The Kiryat Shmona injury (85 + 34, light wounds) passed as `grounded/containment` via ynet and israelnationalnews, and simultaneously failed as `unverified_critical/verification_failed_critical` via timesofisrael and haaretz. Identical claim, four outlets, contradictory verification verdicts — so the demotion is not tracking truth, it is tracking phrasing.

## Spot-Check Sample

8 pending records, scope north, report_date 2026-04-02. Records carry no `confidence`/`grounding_tier` (sampled pre-scoring), so these verdicts assess classification only.

| # | Signal type | Source | Verdict | Reasoning |
|---|---|---|---|---|
| 1 | compliance_enter_shelter | pbo-ג'וליס | ~ | "האירועים... מלמדים על קיום ההנחיות מציל חיים" is a lesson-learned assertion; no shelter entry is described. `compliance_follow_instructions` fits |
| 2 | leadership_visible_presence | pbo-ג'דיידה מכר | ✓ | Religious figures and opinion leaders posting HFC explainer videos is visible informal leadership |
| 3 | resilience_narrative_positive | pbo-קצרין | ~ | Mostly a situation report; the positive-narrative reading is inferred. The same sentence appears in the report as `adaptive_practice` for קצרין — one text, two types |
| 4 | wellbeing_support_accessed | pbo-ג'וליס | ✗ | "הרווחה בקשר תמידי עם האוכלוסיות המיוחדות" is outreach *provided* by welfare, not support *accessed* by residents. Should be `wellbeing_support_provided` |
| 5 | information_actionable_effective | pbo-מגדל | ~ | "אין פערי מידע, קיים ווטסאפ רשותי" describes channel existence and absence of gaps = `information_clarity`; no evidence residents acted |
| 6 | service_continuity | pbo-מגדל | ✓ | Explicit: continuity not interrupted except adapted education policy |
| 7 | solidarity_help_others | pbo-ראמה | ~ | Describes cohesion and absence of excluded groups — a state, not an act of helping. `inter_group_trust` fits, and the near-identical ע'ג'ר phrase was typed that way |
| 8 | community_volunteering | pbo-נחף | ~ | "הרשות עובדת כעת על גיוס מתנדבים" is the authority mobilising, and it is prospective. `resource_mobilization` fits |

**Tally: 2 ✓ / 5 ~ / 1 ✗.** The errors are not scattered — 6 of 6 fall on two axes: **provider vs. recipient** (#4, #8) and **state vs. act / capability vs. effect** (#1, #3, #5, #7).

**Coverage note:** `pbo-ג'וליס` supplies two spot-check records but appears **zero** times in the report JSON. Julis is a northern locality; its PBO material entered extraction and produced no surviving signal. Worth checking whether the report was scope-filtered or dropped downstream.

## Cross-Cutting Patterns

- **Over-used types:** `community_volunteering` 21×, `compliance_follow_instructions` 20×, `wellbeing_support_accessed` 18×, `resource_mobilization` 15×. All four are the diffuse-positive class, all four are near-boilerplate in PBO prose, and `wellbeing_support_accessed` carries the confirmed provider/recipient defect — meaning the third-most-frequent type in the report is systematically over-firing in one direction. `adaptive_practice` deserves a look too: the same four sentences are scored into both functional_continuity and community_capital.
- **Source concentration:** PBO 190/260 (73%), visits 59 (23%), independent news 11 (4%). Per-component `concentration_warning` fires on narrative 0.83, information_communication 0.93, lifesaving_behavior 0.86, leadership 0.76 — but it does **not** fire on community_capital or belonging_solidarity, where PBO+visits is ~99% and only the per-outlet spread keeps it under threshold. The warning measures outlet dispersion, not source-class dependence, and the report's actual exposure is worse than the flags suggest. Compounding this: for `leadership` and `information_communication`, the PBO author *is* the assessed object.
- **Event double-counting:** two real-world events generate 9 signals (Kiryat Shmona casualties ×4, Nahariya kindergarten ×5) and constitute the entire visible negative top of two components. `distinct_article_count` treats them as independent corroboration.
- **Verification inconsistency:** the same Kiryat Shmona injury is `grounded` from two outlets and `verification_failed_critical` from two others.
- **Low-certainty components:** `information_communication` (`confidence: medium`) is correctly the weakest — 15 signals, 7 articles, 93% PBO self-report, only negative demoted. `leadership` is marked `high` but on the evidence should not be: 76% self-report, 46 inferred edges vs 34 primary, 87% positive spillover, gate firing on invisible evidence. All 8 components carry `assessment_state: assessed_low_confidence` while 7 of 8 show `confidence: high` — those two fields telling opposite stories in the same object is itself worth a look.
- **Review completeness is dead:** every component reports `reviewed_sufficient: 0, reviewed_incomplete: 0, unreviewed: <all>` — 190/190 PBO primary signals unreviewed, `incomplete_share: 0`. The three-state tracking is wired but nothing ever lands in a reviewed state, so `incomplete_share: 0` reads as "clean" when it means "no data".
- **Evidence-type monoculture:** 254/260 `observational_reported_fact`, 5 `named_institutional_fact`, **1** `direct_quote_named_person` (and that one was demoted `weak`). No citizen voice survives into any component.
- **Unregistered types:** none. Catalog coverage is complete for this run.

## Improvement Proposals

1. **Strip the translation gloss from visits evidence before grounding verification.** Visits evidence is stored as `Hebrew ( English translation)`; the appended gloss cannot be contained in the Hebrew source, so 27/59 visits signals (46%) miss plain containment — 14 `entailment_rescue`, 10 `low_similarity` demotions, 3 `verification_failed_critical`. Gloss-bearing signals fail grounding at 20.7% vs 2.0% for non-gloss. Verify against the Hebrew span only and keep the gloss as a display field. Expected impact: recovers `early_warning_system_failure`, both visits `protective_infrastructure_absent`, `responder_workforce_strain`, and both `coordination_failure`/`coordination_success` rows — directly benefits lifesaving_behavior, functional_continuity, wellbeing_at_risk, leadership. Highest impact, smallest change, and it is a string bug rather than a judgement call.

2. **Add event-level dedup for news signals before component assembly.** Key on `(signal_type, locality, date, casualty/damage descriptor)` and collapse multi-outlet reports of one incident into a single signal carrying an `outlet_count`. Today one kindergarten strike is 5 signals and one casualty event is 4. Expected impact: functional_continuity and wellbeing_at_risk stop reading as if acute harm is broad when it is one incident each; also removes the contradictory-verification artifact in #4 by giving the event one grounding verdict instead of four.

3. **Split provider-side from recipient-side in the extraction prompt, and capability from effect.** Both spot-check error axes are one instruction away: `wellbeing_support_provided/accessed`, `community_volunteering` vs `resource_mobilization`, `information_clarity` vs `information_actionable_effective`, `inter_group_trust` vs `solidarity_help_others`. Rule to add: *classify by who acts and what was observed to happen, not by the topic the sentence is about; if the sentence describes an institution offering, choose the provided/mobilization type; if it describes residents receiving or acting, choose the accessed/help type; if it describes a channel or capability existing, do not choose an "effective"/"actionable" type.* Expected impact: corrects the #3 most frequent type in the report and 6 of 8 spot-check records; benefits community_capital, wellbeing_at_risk, information_communication, belonging_solidarity.

4. **Make the presence gate render its own cause, or refuse to fire on inferred-only edges.** `leadership`'s `critical_non_compliance_ignore_guidelines` gate fired on a type that routes to leadership as `inferred`, from two signals in one locality, neither visible in the 15 contributors. Either force gate-triggering signals into `top_contributors` regardless of ranking, or restrict gates to `primary` edges. Expected impact: removes an unexplainable critical flag from leadership; prevents the same class of surface bug on any component.

5. **Re-scope `concentration_warning` to source class, not outlet.** Add a check on `source_type` share and on self-report share — where the PBO author is the assessed object (leadership, information_communication), flag it explicitly. Today community_capital (99% PBO+visits) and belonging_solidarity carry no warning at all because 40+ municipalities dilute the per-outlet share. Expected impact: honest exposure labelling on the five components currently under-flagged.

6. **Fix or retire `review_completeness`.** All 190 PBO primary signals land in `unreviewed` with `incomplete_share: 0` in every component, so the field currently signals "clean" while carrying no information. Either propagate the PBO review metadata into assessment, or emit `null` when nothing is reviewed so it cannot be read as a pass. Same for the `assessment_state: assessed_low_confidence` / `confidence: high` contradiction present in 7 of 8 components — one of those two fields is lying to the reader.
