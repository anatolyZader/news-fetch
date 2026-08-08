# Signal Review: north-1-data-2026-04-01-produced-2026-08-08T1516Z
Date: 2026-04-01 | Scope: north | Signals: 284 | Articles: 53 | Produced: 2026-08-08T15:16Z

Source mix: pbo 223 (78.5%), visits 59 (20.8%), news 2 (0.7%).
Grounding tiers: grounded 235 / weak 39 / unverified_critical 10.
Assessment mode: normal, `assessment_degraded: null`, `epistemic_status.scores_reliable: true`, data_void `warning` (`digital_z_drop`, digital_z −3).
All 8 components: `assessment_state: specialist_skipped`, `narrative_grounding_score: null` — no specialist ran, so narrative grounding was never scored on this run.

> Note on format: this branch is min-math (narrative-first). Components carry no `score` and no `certainty`; the closest available fields are `confidence` (all 8 = `medium`), `signal_count`, `distinct_article_count`, `source_diversity`, and `coverage`. Headers below use those instead.

## Executive Summary

Extraction itself is mostly accurate at the sentence level — 280 of 284 evidence strings are distinct, all 284 types resolve in the catalog, and no unregistered types appeared. The problems are almost entirely **downstream of extraction: in typing choices, routing, tiering, and what the developer surface actually shows.** Three findings dominate. First, `top_contributors` is not a ranking — it is `grounded ∩ primary`, taken in file order, and file order is alphabetical by municipality; all 80 contributors across all 8 components are grounded-tier primary-role, and every contributor list is monotonic in the signal-array index. Second, the grounding tier systematically demotes exactly the evidence that matters most for the behavioral components: of the 50 signals routed primary into `lifesaving_behavior`, only 13 are grounded — all 15 `compliance_follow_instructions`, all 4 `compliance_enter_shelter`, all 3 `non_compliance_ignore_guidelines`, `risk_exposure_behavior`, `near_miss_reported`, and `early_warning_system_failure` are weak or unverified_critical, so **not one direct observation of protective behavior, compliant or non-compliant, reaches the visible surface.** Third, `wellbeing_support_accessed` — the report's single most frequent type (26) — does not route to `wellbeing_at_risk` at all, while `wellbeing_support_gap` does; the component ends up 47 negative to 2 positive **by routing construction, not by evidence**, and both of its "positives" are misclassifications.

The most actionable single finding: the Safed (צפת) record is a controlled demonstration of all three failures at once. One sentence produced `compliance_follow_instructions` (weak, invisible), `information_clarity` (grounded, visible) and `information_actionable_effective` (grounded, visible) from **verbatim identical evidence text**; the same municipality's two hard negatives — a minority not adhering for religious reasons, and vehicles driving through sirens *observed on municipal cameras* — were both stamped `unverified_critical` and disappear. The correctly-typed behavioral signal was demoted, its mistyped information-flavored twin was promoted and double-counted, and the camera-verified negative was discarded as unverified.

Underneath this, four audit fields are degenerate and give false comfort: `extraction_confidence` is the constant 0.85 on all 284 signals, `evidence_basis` is `present_in_text` on all 284, `_semantic_dedup_count` is 1 on all 284, and `scope_level` is `repeated_pattern` on 278/284. The two noise checks this review command is built around — `evidence_basis: inferred` and `confidence < 0.6` — therefore return zero hits by construction, not because the data is clean.

## Per-Component Evidence Quality

### Narrative (confidence: medium, signals: 13, articles: 13, source_diversity: 3)

Routed composition (20 edges): `resilience_narrative_positive` 10 (+/primary), `trusted_information_source` 2 (+/inf), `rumor_correction` 2 (+/inf), `resilience_narrative_negative` 2 (−/primary), `calm_confidence` 1 (+/primary), `leadership_credibility_loss` 1 (−/inf), `positive_wellbeing_marker` 1 (+/inf), `political_distrust` 1 (−/inf). 16 positive / 4 negative.

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| calm_confidence | יש לנו עונג גדול להיות בבית עם כל המתח (ynet) | ✗ | One returnee's personal remark in a news piece. The component is about the *dominant public story*; a single household quote cannot evidence a collective narrative. Also double-routes +/primary into `wellbeing_at_risk`, where it is the only positive signal. |
| resilience_narrative_positive | בועינה - נוג'ידת: הנרטיב המרכזי בקהילה הוא של הבנה למצב החירום… | ✓ | Explicit collective self-characterization; matches the catalog label exactly. |
| resilience_narrative_positive | טובא-זנגריה: התושבים ממשיכים בשגרה יחסית, תוך מודעות גבוהה יותר להנחיות | ~ | Describes behavior (routine continuing), not a narrative statement. Catalog label says "collective self-assessment statements ONLY, never the concrete facts behind them" — this is the facts. |
| resilience_narrative_negative | יאנוח-ג'ת: האירוע של יום שבת עם המצנח שלא זוהה… גרם לפגיעה בתחושת החוסן | ✓ | Named event, stated effect on collective sense of resilience. The strongest narrative signal in the set. |
| resilience_narrative_positive | מג'דל שמס: האוכלוסיה מנסה לקיים שגרה על אף החירום | ~ | Again facts-not-narrative; also "מנסה" (trying) is weaker than the +/primary edge implies. |
| resilience_narrative_positive | משגב: התושבים מפגינים חוסן מרשים ועזרה הדדית… לשמור על קהילה מאוחדת | ✓ | Explicit narrative framing ("הנרטיב העיקרי הוא"). |
| resilience_narrative_positive | נחף: הקהילה הוכיחה שכוחה אינו רק בתשתיות – אלא באנשים שבה | ✓ | Clear collective meaning-making statement. |
| resilience_narrative_positive | עין קנייא: תושבים חזקים מתמודדים עם המציאות המורכבת בצורה טובה מאוד | ~ | An official's appraisal *of* residents, not residents' self-characterization. Attribution slippage (see cross-cutting). |
| resilience_narrative_positive | עראבה: יש רציפות תפקודית בקרב התושבים ומנהלים את חייהם לצד מצב החירום | ✗ | This is functional continuity described verbatim ("רציפות תפקודית"), typed as narrative. Belongs in `functional_continuity`. |
| resilience_narrative_positive | ראמה: האוכלוסיה משדרת נרטיב חיובי… זו המלחמה השלישית והאוכלוסיה התרגלה | ✓ | Genuine narrative claim with a stated mechanism (habituation across three wars). Analytically the most distinctive item here. |

**Weak links:** `calm_confidence`/ynet (single-household quote as collective narrative); `resilience_narrative_positive`/עראבה (functional-continuity content); `resilience_narrative_positive`/עין קנייא (official's appraisal, not resident self-assessment).
**Gaps:** Guiding question 3 — *competing or contradictory narratives undermining the shared story* — has almost no evidence: 9 of 10 visible items are positive and near-interchangeable, and the only counter-narrative in the whole report (Sakhnin's fatigue + complacency, spot-check `sc_2026-04-01_53dc9ec2`) was typed *positive*. Guiding question 2 — whether the **official** narrative is perceived as credible **by the population** — is not evidenced at all; every item here is the authority describing the population.

### Information, Communication, and Sharing (confidence: medium, signals: 37, articles: 22, source_diversity: 2)

Routed composition (52 edges): `information_clarity` 24 (+/primary), `institutional_trust` 12 (+/inf), `information_actionable_effective` 9 (+/primary), `trusted_information_source` 2, `rumor_correction` 2, `non_compliance_due_to_distrust` 1 (−), `political_distrust` 1 (−/inf), `early_warning_system_failure` 1 (−). **49 positive / 3 negative.**

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| information_clarity | המידע והעדכונים מועברים… רשתות חברתיות, קבוצות קהילתיות וערוצי תקשורת ארציים | ~ | Describes channels *existing*, not residents receiving clear/useful information (the catalog label is "Residents report receiving clear, useful information"). Channel-inventory, not clarity. |
| information_actionable_effective | רוב הציבור מתעדכן ופועל בהתאם להנחיות | ~ | Half-fits: "פועל בהתאם" is compliance, better served by `compliance_follow_instructions`. Catalog requires guidance be "specific, situation-matched"; nothing here describes the guidance itself. |
| information_clarity | התושבים מכירים היטב את ההנחיות | ~ | Residents *knowing* guidelines is a knowledge outcome (lifesaving_behavior GQ 3), not a property of information delivery. |
| information_actionable_effective | התושבים נשמעים להנחיות נוכח האירועים שקרו | ✗ | Pure compliance statement, no information content whatsoever. Should be `compliance_follow_instructions`. |
| information_clarity | מקיימים שיחות עם התושבים ומעודדים לשמור על ההנחיות | ✗ | Leadership outreach activity → `leadership_clear_guidance`. No claim about information clarity. |
| information_clarity | הודעות מדוגרות לתושבים בזמני אירוע במיידי… רענון של הנחיות פיקוד העורף | ✓ | Timeliness + refresh cadence; genuinely about message delivery quality. |
| information_actionable_effective | מתנדבי הנוער פעילים ותומכים ומסייעים לקשישים בהבאת תרופות, מזון… | ✗ | **Clearest misclassification in the report.** Youth volunteers delivering medicine and food is `community_volunteering` / `solidarity_help_others`. There is no guidance, no information, and no protective behavior in this sentence. It nonetheless occupies a visible slot in *two* components (here and `lifesaving_behavior`). |
| information_clarity | התושבים במעקב אחר עדכונים, בעיקר דרך קבוצות הווטסאפ והרשתות החברתיות | ✓ | Resident-side information-seeking behavior with named channels. |
| information_actionable_effective | התושבים ממשיכים להשמע להנחיות… ומאמנים שההנחיות מצילות חיים | ~ | Compliance + threat belief. Belief that guidance saves lives is arguably "demonstrably leads to correct protective behavior", but the primary content is compliance. |
| information_clarity | התושבים מקבלים הרבה הסברה בנושא התמודדות עם המצב | ~ | Volume of הסברה ≠ clarity. "הרבה" is a quantity claim standing in for a quality claim. |

**Weak links:** `information_actionable_effective`/טבריה (volunteer logistics, no information content); `information_clarity`/גליל תחתון (leadership outreach); `information_actionable_effective`/ג'דיידה מכר (bare compliance).
**Gaps:** GQ 3 (*information gaps, misinformation, fake news*) has 2 `rumor_correction` and nothing else — 49:3 positive skew on a component whose whole purpose includes detecting information failure. GQ 4 (*accessibility for vulnerable groups, adapted messaging*) is essentially unevidenced despite the report containing a rich at-risk-population layer in `wellbeing_at_risk`; nobody extracted "was the message adapted for the elderly / Arabic speakers / people with disabilities". Given that 78% of sources are Arabic-speaking municipalities, the absence of any language-adaptation signal is a conspicuous hole.

### Effective Life-Saving Behavior (confidence: medium, signals: 48, articles: 26, source_diversity: 2)

Routed composition (99 edges, **49 of them inferred**): `leadership_clear_guidance` 25 (+/inf), `information_clarity` 24 (+/inf), `compliance_follow_instructions` 15 (+/primary), `information_actionable_effective` 9 (+/primary), `protective_infrastructure_absent` 6 (−/primary), `compliance_enter_shelter` 4 (+/primary), `responder_workforce_strain` 4 (−/primary), `non_compliance_ignore_guidelines` 3 (−/primary). 77 positive / 22 negative.

**Primary pool by tier — the central defect of this report:**

| Tier | Types | n |
|---|---|---|
| grounded | information_actionable_effective 9, responder_workforce_strain 2, protective_infrastructure_absent 2 | **13** |
| weak | compliance_follow_instructions 15, compliance_enter_shelter 4, compliance_partial 2, preparedness_gap_identified 2, responder_workforce_strain 2, non_compliance_due_to_distrust 1, risk_trade_off_behavior 1 | **27** |
| unverified_critical | protective_infrastructure_absent 4, non_compliance_ignore_guidelines 3, near_miss_reported 1, risk_exposure_behavior 1, early_warning_system_failure 1 | **10** |

Since `top_contributors` = grounded ∩ primary, 37 of 50 primary signals — **every direct behavioral observation in the component** — are structurally invisible.

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| information_actionable_effective | רוב הציבור מתעדכן ופועל בהתאם להנחיות | ~ | Compliance content surfacing here only because it carries an information-flavored type. |
| information_actionable_effective | התושבים נשמעים להנחיות נוכח האירועים שקרו | ~ | Same; genuine compliance evidence, wrong type. |
| information_actionable_effective | מתנדבי הנוער… מסייעים לקשישים בהבאת תרופות, מזון… ניקיון וארגון של מקלטים | ✗ | Mutual aid, not life-saving behavior. Shelter *cleaning* is not shelter *use*. |
| information_actionable_effective | התושבים ממשיכים להשמע להנחיות פיקוד העורף ומאמנים שההנחיות מצילות חיים | ✓ | Compliance + perceived threat: hits GQ 1 and GQ 2 directly. Correct component, arguably wrong type. |
| information_actionable_effective | הוצא סרטון מהיקלר המסביר בפירוט מה לעשות בזמן אזעקה | ~ | An instructional video is guidance *supply*; nothing shows it changed behavior, which the catalog label requires ("demonstrably leads to"). |
| information_actionable_effective | ניתן לראות שהם נכנסים למרחבים מוגנים בזמן אזעקה ועוקבים אחרי ההנחיות | ✓ | The one genuinely observational shelter-entry statement in the visible set — and it is typed `information_actionable_effective`, not `compliance_enter_shelter`. |
| information_actionable_effective | רוב התושבים מאמינים כי מילוי ההנחיות… מסייע לשמור על חייהם ובטחונם | ~ | Belief, not behavior. Matches GQ 2 (threat perception), not GQ 1. |
| information_actionable_effective | התושבים ממושמעים מאוד וסומכים על הנחיות פיקוד העורף | ~ | Compliance + institutional trust; no information property. |
| information_actionable_effective | רוב התושבים מקשיבים להנחיות, מפנימים… ופועלים לפיהן באופן אחראי (צפת) | ✗ | **Verbatim identical text to this municipality's `information_clarity` signal, and to the demoted `compliance_follow_instructions`.** One sentence, three signals, two of them grounded and visible. |
| responder_workforce_strain | מגדל: shortage of volunteers | ~ | Real but content-free: three words, no scale, no service affected. Also routes −/primary into `leadership` on the same three words. |

**Weak links:** all 9 `information_actionable_effective` contributors are the *only* thing visible here, and by the catalog's own definition at most 2 of them qualify. The component's visible surface is 90% borrowed from `information_communication`.
**Gaps:** Shelter entry (`compliance_enter_shelter`, 4 signals) — the single most direct life-saving behavior — never surfaces, because all 4 are weak-tier. Enforcement (GQ 4) is unevidenced entirely: no signal in the report describes formal or community enforcement. The presence gate fired on `protective_infrastructure_absent` ("צורך במבנים מוגנים בדגש על מרפאה מוגנת") while all 10 visible contributors are positive — the gate and the surface tell opposite stories, with no reconciliation shown to the developer.

### Functional Continuity (confidence: medium, signals: 17, articles: 14, **source_diversity: 1**)

Routed composition (60 edges, **43 inferred**): `wellbeing_support_accessed` 26 (+/inf), `service_disruption` 13 (−/primary), `resource_shortage` 6 (−/inf), `responder_workforce_strain` 4 (−/inf), `parental_burden` 2 (−/inf), plus 3 singletons. Only **17 primary edges** in the entire component. 30 positive / 30 negative — a balance produced entirely by inferred spillover, since 26 of the 30 positives are welfare-department activity inferred in from `community_capital`.

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| service_disruption | רמת השירותים הרפואיים נפגעה בדגש על טיפות חלב ובריאות הנפש | ✓ | Named services, clear disruption. |
| service_disruption | הרפואה בקהילה נפגעה, כך גם מערך הרפואה בבתי חולים | ✓ | Same claim, different visit team. |
| service_disruption | יש פגיעה במערכת השירותים הרפואיים בקהילה ורפואה בבתי חולים | ✓ | **Third near-verbatim restatement**, same team as the previous row. |
| service_disruption | מערכת הבריאות נפגעת… רפואה בקהילה, טיפות חלב, מענים נפשיים | ✓ | Fourth. |
| service_disruption | יש פגיעה במערכת רפואה ובמענים נפשיים | ✓ | Fifth. |
| service_disruption | מערך השירותים בבית חולים נפגע | ✓ | Sixth. |
| service_disruption | יש פגיעה במערכת השירותים - רפואה בקהילה, טיפות חלב, מענים נפשיים, רפואה בבתי חולים | ✓ | Seventh. |
| service_disruption | יש עדות לפגיעה במערך טיפות החלב | ✓ | Eighth. |
| service_disruption | קיימת פגיעה בצריכת שירותים רפואיים בבתי חולים | ✓ | Ninth. |
| system_overload | המנהל/ת מעידים על עצמם כמוצפים | ✓ | Distinct and useful — the one non-healthcare item visible. |

Every contributor is individually correct, which is precisely the problem: **9 of 10 visible contributors are the same finding restated by different visit teams**, and `_semantic_dedup_count` is 1 for all of them, so the deduplicator collapsed nothing.

**Weak links:** none by type — all correctly classified. The defect is redundancy, not relevance.
**Gaps:** GQ 1 (*work, studies, commerce, leisure*) is unrepresented in the visible set despite being the guiding question with the broadest reach; the one education-continuity item in the data (Sakhnin's unplanned spring break with no camps, spot-check `sc_2026-04-01_4eae72a1`) was typed `service_continuity` — a **positive**-polarity type — for evidence describing a gap. GQ 3 (essential workplaces / educational institutions operating) and GQ 4 (maintaining functional and social roles) have no primary evidence at all. The component reads as "northern healthcare is degraded" and nothing else, on `source_diversity: 1`.

### Community Capital and Resources (confidence: medium, signals: 96, articles: 41, source_diversity: 2)

Routed composition (105 edges, only 7 inferred — the most primary-dense component): `wellbeing_support_accessed` 26, `community_volunteering` 25, `solidarity_help_others` 14, `resource_mobilization` 13, `wellbeing_support_gap` 7 (−/inf), `resource_shortage` 6 (−), `bridging_capital_demonstrated` 4, `digital_mutual_aid` 3. **89 positive / 16 negative.**

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| resource_mobilization | בועינה: הרשות פועלת למיצוי משאבי הקהילה… מערך מתנדבים ושיתוף פעולה | ✓ | Directly answers GQ 1 and GQ 3. |
| solidarity_help_others | בועינה: הקהילה מגלה אחריות הדדית ונכונות לסייע זה לזה… | ~ | Belongs primarily to `belonging_solidarity`; here it is a +/primary duplicate of the same sentence family. |
| wellbeing_support_accessed | בועינה: מחלקת הרווחה פועלת באופן רציף למתן מענה… דגש לאוכלוסיות בסיכון | ✗ | Catalog label is "**Individuals or groups access** psychological support…". This is the *department operating*, not anyone accessing. And it should reach `wellbeing_at_risk` — it does not (see cross-cutting). |
| local_capacity_demonstrated | בוקעאתא: אין אתגר או פער במיצוי משאבי הקהילה - בשעת הצורך כולם יתנדבו | ✗ | A prediction ("כולם יתנדבו" — everyone *will* volunteer) plus a self-issued clean bill of health. No demonstrated capacity. Typed `local_capacity_demonstrated` on the strength of an official's assurance. |
| solidarity_help_others | בוקעאתא: תחושת סולידריות ואכפתיות - כולם משפחה אחת | ~ | Sentiment, no action. |
| wellbeing_support_accessed | בוקעאתא: ביקורי בית תמידיים, מועדון קשישים פתוח… מענה באופן יומי | ✓ | Concrete, recurring, named services. Best item in the component. |
| resource_mobilization | גליל תחתון: קיימות התארגנויות ספונטניות של מתנדבים בנוסף למתנדבים דרך הרשות | ✓ | Distinguishes spontaneous from institutional mobilization — genuinely informative for GQ 1. |
| community_volunteering | גליל תחתון: בני הנוער מתנדבים ועוזרים עם הפעילויות | ✓ | Correct, though thin. Same source sentence as the row above (see spot-check 7). |
| solidarity_help_others | גליל תחתון: קבוצות של עזרה הדדית בדגש על אוכלוסיות מוחלשות | ✓ | Also emitted verbatim as `interpersonal_trust` into `belonging_solidarity`. |
| resource_mobilization | דיר אל אסד: גופי מתנדבים ממוסדים כמו סע"ר, מד"א, צח"י, עמותות | ✓ | Named anchor organizations — exactly GQ 3. |

**Weak links:** `wellbeing_support_accessed`/בועינה (department activity typed as access); `local_capacity_demonstrated`/בוקעאתא (assurance typed as demonstration).
**Gaps:** GQ 4 (*cross-sector cooperation*) is thin — `bridging_capital_demonstrated` appears only 4× in 284 signals; there is nothing on business/NGO/health-system partnership. All 3 visible ב-municipalities contribute 2–3 slots each, so the visible surface covers 4 municipalities out of 41 contributing articles.

### Leadership (confidence: medium, signals: 53, articles: 35, source_diversity: 2)

Routed composition (99 edges, **44 inferred**): `leadership_clear_guidance` 25 (+/primary), `compliance_follow_instructions` 15 (+/inf), `interpersonal_trust` 15 (+/inf), `institutional_trust` 12 (+/primary), `leadership_visible_presence` 7 (+/primary), `compliance_enter_shelter` 4 (+/inf), `responder_workforce_strain` 4 (−/primary), `non_compliance_ignore_guidelines` 3 (−/inf). **82 positive / 17 negative.**

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| institutional_trust | נתפסים אמינים (pbo-אעבלין) | ✗ | **Two words, no subject.** "Perceived as credible" — who? Passed as `grounded` tier. This is the weakest evidence string in the report and it is the top visible contributor to Leadership. |
| leadership_visible_presence | המנהיגות המקומית, הן הפורמלית והן הבלתי פורמלית, פעילה ומעורבת | ✓ | Explicitly covers formal + informal leadership, matching the component definition. |
| leadership_clear_guidance | ראש הרשות, חברי המליאה, הנהגות מקומיות… להעברת מסרים, הסברה וקשר עם התושבים | ✓ | Named roles, named activity. |
| institutional_trust | ניכרת תחושת שייכות, סולידריות ואמון במנהיגות המקומית ובגורמי הרשות | ~ | Bundles belonging + solidarity + trust in one string; only the last clause supports Leadership. Same sentence family also feeds `belonging_solidarity` as `interpersonal_trust`. |
| leadership_clear_guidance | בוקעאתא: המנהיגות קוראת ללא הרף לשמור על ההנחיות, הם מאמינים בזה | ✓ | GQ 2 (personal example) and GQ 1. |
| leadership_clear_guidance | אנשי דת ומשפעי דעת קהל מעלים סרטונים… מסבירים את החשיבות להנחיות | ✓ | Religious figures and influencers — exactly the component's stated scope. |
| leadership_clear_guidance | ג'וליס: מפשטים את ההנחיות בשפה עממית ושזה בא מהבית קליט יותר | ✓ | Message adaptation with a stated mechanism. Notably this is the report's only real *adapted-messaging* evidence — and it landed in Leadership, not Information. |
| leadership_visible_presence | דיר אל אסד: נוכחות ההנהגה… בתקשורת המקומית… מצייר אווירה בטוחה ומרגיעה | ✓ | Presence + stated effect. |
| institutional_trust | דיר אל אסד: הנהגת הישוב מאד מקובלת… ומהווים דוגמא אישית | ✓ | GQ 2 and GQ 3 directly. |
| leadership_clear_guidance | דיר חנא: יש למנהיגים השפעה רבה על התושבים | ~ | Bare influence claim; no guidance content, no example, no mechanism. |

**Weak links:** `institutional_trust`/אעבלין ("נתפסים אמינים"); the 15 `interpersonal_trust` (+/inferred) edges — residents trusting *each other* inflating a leadership reading; `leadership_clear_guidance`/דיר חנא.
**Gaps:** GQ 4 (*represents and addresses all community segments, including marginalized groups*) has no evidence at all — striking given that Safed's own record identifies a religious minority not complying, and no signal connects leadership to that group. The only negative leadership evidence in the whole report is 4 `responder_workforce_strain` and 1 `leadership_credibility_loss`; 82:17 positive from a source base that is 78% the leadership assessing itself.

### Belonging and Solidarity (confidence: medium, signals: 62, articles: 33, source_diversity: 3)

Routed composition (68 edges, 64 primary): `community_volunteering` 25, `interpersonal_trust` 15, `solidarity_help_others` 14, `compliance_enter_shelter` 4 (+/inf), `bridging_capital_demonstrated` 4, `digital_mutual_aid` 3, `resilience_narrative_negative` 2 (−), `return_intention_expressed` 1. **66 positive / 2 negative — the most one-sided component in the report.**

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| return_intention_expressed | אנחנו לא עוזבים שוב בשום אופן (ynet) | ✓ | Genuine attachment-to-place statement; one of only 2 news signals in 284. |
| interpersonal_trust | בועינה: ניכרת תחושת שייכות וסולידריות… אחריות הדדית ונכונות לסייע | ✓ | On-definition. |
| interpersonal_trust | בוקעאתא: תחושת סולידריות ואכפתיות - כולם משפחה אחת | ✓ | On-definition. |
| interpersonal_trust | גליל תחתון: קבוצות של עזרה הדדית בדגש על אוכלוסיות מוחלשות | ✓ | Also emitted as `solidarity_help_others` into `community_capital` from the same sentence. |
| interpersonal_trust | דיר אל אסד: רמה גבוהה מאד ורוח התנדבותית לתפארת מדינת ישראל… | ~ | Evaluative flourish ("לתפארת מדינת ישראל") rather than observation; classic self-report register. |
| interpersonal_trust | דיר חנא: יש חיבור רגשי בין התושבים בגלל פחד המלחמה | ✓ | Interesting — names fear as the bonding mechanism. Analytically the most distinctive item here. |
| interpersonal_trust | טובא-זנגריה: במצבי חירום מתחזקת העזרה ההדדית… שכנים והרשות מסייעים | ✓ | On-definition. |
| interpersonal_trust | כפר יאסיף: רמת השייכות והסולידריות גבוהה… עוזרים אחד לשני, מתנדבים | ✓ | On-definition. |
| interpersonal_trust | מג'ד אל-כרום: רבים מגלים ערבות הדדית ומוכנות לעזור לשכנים ולקרובי משפחה | ✓ | On-definition. |
| interpersonal_trust | נחף: השכנים דאגו לקשישים ולמשפחות עם ילדים קטנים… ערבות הדדית וחוסן | ✓ | Concrete beneficiaries named. |

Classification accuracy is the highest of any component. The problem is uniformity: **9 of 10 visible contributors are `interpersonal_trust` and all say substantially the same thing.**

**Weak links:** `interpersonal_trust`/דיר אל אסד (evaluative register). The 15 `interpersonal_trust` → `leadership` inferred edges are a cross-component weak link rather than a local one.
**Gaps:** GQ 3 — *groups perceived as "outside the camp", scapegoated, or blamed* — has **zero** signals across the entire report. This is the single largest evidence gap in the assessment: Safed's record explicitly describes a religious minority behaving differently, which is exactly the raw material for a scapegoating/othering signal, and no catalog type captured it. GQ 4 (programs targeting marginalized groups) is also unevidenced. A component at 66:2 positive with no othering evidence in a mixed Jewish/Arab/Druze/Circassian region should be read as under-instrumented, not as a strong result.

### Physical and Mental Wellbeing — At-Risk Populations (confidence: medium, signals: 33, articles: 23, source_diversity: 3)

Routed composition (49 edges, 16 inferred): `service_disruption` 13 (−/inf), `wellbeing_support_gap` 7 (−/primary), `protective_infrastructure_absent` 6 (−/primary), `resource_shortage` 6 (−/primary), `psychological_distress` 5 (−/primary), `parental_burden` 2 (−/primary), `calm_confidence` 1 (+/primary), `positive_wellbeing_marker` 1 (+/primary), `risk_trade_off_behavior` 1 (−/inf), `household_strain_economic` 1 (−/primary). **2 positive / 47 negative.**

| Signal type | Evidence (truncated) | Verdict | Note |
|---|---|---|---|
| calm_confidence | יש לנו עונג גדול להיות בבית עם כל המתח (ynet) | ✗ | A returnee's remark about being home. Says nothing about identifying or serving vulnerable populations. One of only two positives in the component. |
| parental_burden | דיר חנא: התושבים מרגישים שהילדים בבתים נחנקים | ✓ | Names the vulnerable group and the strain. |
| positive_wellbeing_marker | טבריה: התושבים מבינים שציות להנחיות פקע"ר אינו בגדר המלצה אלא מציל חיים! | ✗ | Catalog label: "Population-level gratitude, efficacy, or **meaning-making**". This is threat awareness / compliance rationale — `compliance_follow_instructions` or a threat-perception type. The component's second and last positive is also spurious. |
| wellbeing_support_gap | יאנוח-ג'ת: פגיעה ברציפות תפקודית לאוכלוסייה המבוגרת, דואר ישראל סגור | ✓ | Named group, named service, named duration. Strong. |
| psychological_distress | יאנוח-ג'ת: התושבים כבר עייפים ויש שיח גדול בעניין סיום המלחמה | ✓ | Population-level fatigue with a behavioral correlate (the discourse). |
| resource_shortage | יבנאל: קבוצת המתנדבים דרושה בניה מחדש… מאגר של כ15 מתנדבים | ~ | Volunteer-corps capacity → `community_capital`. Routes −/primary here too, so a community-resource problem is counted as an at-risk-population problem. |
| household_strain_economic | יבנאל: ניכרת עליה בפנייה לעזרה כלכלית | ✓ | Rising demand for financial aid — a real vulnerability indicator with direction. |
| wellbeing_support_gap | כפר יאסיף: צורך בהרחבת המענים… תמיכה נפשית. קיימים מענים אך פערים בזמינות ונגישות | ✓ | Best item in the component: acknowledges provision *and* names the gap dimensions (availability, accessibility) — directly GQ 2. |
| psychological_distress | כפר כמא: התחושות התושבים ותשישות מהמצב הממושך | ✓ | On-definition, though thin. |
| psychological_distress | כפר כמא: שחיקה מנטלית | ✓ | Two words, same source, same finding as the row above — a near-duplicate occupying a second slot. |

**Weak links:** both positives (`calm_confidence`, `positive_wellbeing_marker`) are misclassified, meaning the component's **true positive evidence count is zero**; `resource_shortage`/יבנאל (community-capital content). The 13 `service_disruption` (−/inferred) edges are healthcare-system findings from the visits layer, already counted 9× in `functional_continuity`.
**Gaps:** GQ 1 and GQ 3 — *identifying* vulnerable populations and *mechanisms to locate, map, and monitor* them — are the component's core, and the report contains abundant evidence for exactly this (Deir al-Asad's name-and-place registry, Safed's four separate at-risk-group protocols for assisted living, nursing-care population, seniors, and people with special needs). **All of it was typed `wellbeing_support_accessed` and routed to `community_capital`, never reaching this component.** The presence gate fired on `harm_to_population` (Nahf: intercept shrapnel in 4 locations, 3 anxiety casualties evacuated) — a genuinely critical item that also does not appear among the contributors.

## Cross-Cutting Patterns

- **`top_contributors` is not a ranking.** All 80 contributors across 8 components are `grounded` tier and `primary` role, and every component's contributor list is strictly monotonic in the signal-array index (e.g. community_capital = indices 124,125,126,127,128,129,132,133,134,135). Signals are ordered by article, and articles are ordered alphabetically by municipality. Every contributor carries `intensity: "moderate"` and there is no `_contribution` field. **The developer surface is therefore "the alphabetically-first grounded primary signals", not "the most important evidence".** For `community_capital` (96 signals, 41 articles) the visible 10 come from 4 municipalities, all starting ב/ג/ד.

- **The tier filter silently removes the behavioral evidence base.** 39 weak + 10 unverified_critical = 49 signals (17% of the report) can never surface. Their composition is not random: **every** `compliance_follow_instructions` (15/15), **every** `compliance_enter_shelter` (4/4), **every** `compliance_partial` (2/2), **every** `non_compliance_ignore_guidelines` (3/3), plus `risk_exposure_behavior`, `near_miss_reported`, `early_warning_system_failure`, and 4 of 6 `protective_infrastructure_absent`. Attitudinal and institutional-activity types (`information_clarity`, `institutional_trust`, `wellbeing_support_accessed`, `community_volunteering`, `interpersonal_trust`) are almost entirely `grounded`. The pipeline is grading *what officials assert about attitudes* as verifiable and *what they report about behavior and infrastructure* as unverified.

- **The Safed control case.** One municipal record produced: `compliance_follow_instructions` (weak — invisible), `information_clarity` (grounded — visible in Information), `information_actionable_effective` (grounded — visible in Information **and** Life-Saving Behavior) from **byte-identical evidence text**; plus `non_compliance_ignore_guidelines` (unverified_critical — invisible) and `risk_exposure_behavior` (unverified_critical — invisible) *despite the source stating the observation came from municipal cameras*. The positive reading of this municipality is triple-counted and fully visible; the negative reading, which is the better-sourced half, is entirely suppressed.

- **Routing asymmetry starves `wellbeing_at_risk` of positives.** `wellbeing_support_accessed` (26 — the most frequent type in the report) routes `community_capital` +/primary and `functional_continuity` +/inferred, and **not to `wellbeing_at_risk` at all**. Its mirror, `wellbeing_support_gap` (7), routes `wellbeing_at_risk` −/primary. The provision of support scores a different component from the absence of support. Consequence: 2 positive vs 47 negative, and both positives are misclassifications — so the component that measures care for vulnerable populations receives, by construction, **zero** evidence that anyone is being cared for, while the report contains dozens of such records.

- **Over-used types.** `wellbeing_support_accessed` 26 — stretched from "individuals access support" to "the welfare department exists and is busy"; almost every instance is institutional activity, not access. `leadership_clear_guidance` 25 and `information_clarity` 24 both route +/inferred into `lifesaving_behavior`, contributing 49 of its 99 edges without a single behavioral observation between them. `community_volunteering` 25 and `interpersonal_trust` 15 and `solidarity_help_others` 14 are frequently emitted from the same sentence into `community_capital` and `belonging_solidarity`, mutually reinforcing two components off one claim. `information_actionable_effective` 9 — small count, outsized effect: it is 9 of the 10 visible Life-Saving Behavior contributors, and by the catalog's own wording at most 2 qualify.

- **Source concentration.** PBO = 223/284 (**78.5%**), spread over 40 municipalities so no single source exceeds 5% — the per-source counter therefore never trips a concentration flag even though the *source class* dominates completely. Evidence quality in this class is systematically self-referential: municipal emergency staff assessing their own municipality's leadership, information, and community capital. This shows up as polarity skew — belonging 66:2, information 49:3, leadership 82:17, community_capital 89:16 positive — with all negativity concentrated in the one component (`wellbeing_at_risk`, 2:47) that describes needs rather than performance. Visits = 59 (20.8%) and carry nearly all the concrete negative infrastructure findings. News = 2 signals (0.7%), and both are single-household quotes from one ynet article that nonetheless occupy visible slots in three components (`narrative`, `wellbeing_at_risk`, `belonging_solidarity`).

- **Visits source-identity aliasing.** 59 visits signals carry 12 distinct `article_source` values, but several are the same team under permuted names: `אנג'ל מנגוני וכארם שוקור` (6) / `כארם שוקור ואנג'ל מנגוני` (5); `יוסף עראידה, מארק גרמן יעקובוב,` (3) / `מארק גרמן יעקובוב ויוסף עראידה` (3); `נאיל + אראיל` (3) / `נאיל + אריאל` (1) / `אריאל + נאיל` (1). **12 apparent sources are 8 actual teams**, inflating `source_diversity` and `distinct_article_count` and defeating dedup on the 9 near-identical healthcare-disruption statements.

- **Degenerate audit fields.** `extraction_confidence` = 0.85 for all 284 signals (the real per-signal `confidence` does vary, 0.65–0.95); `evidence_basis` = `present_in_text` for all 284; `_semantic_dedup_count` = 1 for all 284; `scope_level` = `repeated_pattern` for 278/284. The two noise heuristics this review procedure specifies — `evidence_basis: inferred` and `confidence < 0.6` — return **zero hits by construction**, not because the extraction is clean. Any dashboard or gate reading `extraction_confidence` is reading a constant.

- **Cross-municipality duplicate evidence.** 4 evidence strings appear twice (8 signals). Three are same-source double-typing, but one — `הרשות מספקת הסברה על הנחיות ההתגוננות וחוסן במספר ערוצי תקשורת שונים` — is attributed to **both** `pbo-גולן` and `pbo-דיר אל אסד`. Either two municipalities filed identical template text (which would make the whole PBO corpus partly boilerplate) or source attribution is wrong on one of them. Worth resolving before trusting PBO source counts.

- **Low-diversity / thin components.** `functional_continuity` has `source_diversity: 1` and only 17 primary edges, 9 of its 10 visible contributors restating one healthcare finding. `narrative` has 13 signals over 13 articles, 8 of them the same self-assessment type. Both are reported at `confidence: medium`, the same level as `community_capital` (96 signals, 41 articles) — the confidence label does not discriminate.

- **Unregistered types:** none. All 50 distinct types resolve in `SIGNAL_CATALOG`, and `NON_SCORING_FALLBACK_TYPES` is empty. Catalog conformance is clean; the problems are in type *selection*, not type *existence* — with one exception: no catalog type covers othering/scapegoating (`belonging_solidarity` GQ 3), which is why that question has zero evidence.

- **Specialist skipped on all 8 components.** Every component reports `assessment_state: specialist_skipped`, `developer_flags: ["specialist_not_run"]`, and `narrative_grounding_score: null` — yet `epistemic_status.scores_reliable` is `true` and `assessment_degraded` is `null`. A run where no specialist executed and no narrative grounding was scored should not present as undegraded.

## Spot-Check Sample

8 pending records in `data/spot_checks/spot-checks-2026-04-01.jsonl`, all scope `north`, all `source_type: pbo`, all `evidence_type: observational_reported_fact`. Verdicts below; the JSONL was not modified.

| # | ID | Type → components | Verdict | Reasoning |
|---|---|---|---|---|
| 0 | sc_…e11ca736 | leadership_visible_presence → leadership | ~ | Yanuh-Jat. The passage's dominant content is message discipline (every announcement vetted, issued after situation assessments, published in an orderly way) — that is `information_clarity`. Visible presence is present ("הרשות מעורבת בכל דבר", "יש על מי לסמוך") but secondary. Also a 5-sentence blob carrying ≥3 separable claims; chunking, not just typing, is the issue. |
| 1 | sc_…ac068e42 | compliance_enter_shelter → lifesaving_behavior | ✗ | Safed. **No shelter entry is mentioned anywhere in the evidence.** The text describes general adherence, a non-adhering minority, and vehicles continuing to drive during sirens. Correct types would be `compliance_follow_instructions` + `non_compliance_ignore_guidelines` + `risk_exposure_behavior` — all three of which the pipeline *also* extracted separately from this same paragraph, then demoted to weak/unverified_critical. |
| 2 | sc_…53dc9ec2 | resilience_narrative_positive → narrative | ✗ | Sakhnin. **Polarity inversion.** Evidence reads: fatigue in the population from the war's length and the volume of launches, expectation of unquiet days around the holiday, and continuing complacency in following guidance ("שאננות בהישמעות להנחיות"). Every clause is negative. This should be `resilience_narrative_negative` plus `non_compliance_ignore_guidelines`. The report's only genuine counter-narrative was filed as a positive. |
| 3 | sc_…29621998 | wellbeing_support_accessed → community_capital | ~ | Deir al-Asad. Evidence describes *authority readiness* — welfare department institutionalized, backed by volunteer teams, a drill held last week, exact name-and-place registry — not anyone *accessing* support, which is what the catalog label requires. More importantly the registry-and-monitoring content is a textbook `wellbeing_at_risk` GQ 3 item, and the routing sends it only to `community_capital`. |
| 4 | sc_…4eae72a1 | service_continuity → functional_continuity | ✗ | Sakhnin. Evidence states a **gap** in education provision — kindergarten and primary pupils sent on an unplanned spring break with no camps organized. `service_continuity` routes `functional_continuity` **+/primary**; the correct type is `service_disruption` (−/primary). A second polarity inversion, from the same municipality as #2. Note `service_continuity` appears 0 times in the final report's signal set, so this record either did not survive or was retyped downstream — worth tracing. |
| 5 | sc_…378ef0c3 | solidarity_help_others → belonging_solidarity, community_capital | ✓ | Eilabun. "סולידריות בצורה טובה מאוד וזה מאפיין תושבי היישוב" — correctly typed, but a bare assertion with no behavioral instance, and it feeds two components off one content-free sentence. Correct classification, minimal information. |
| 6 | sc_…f338f7ff | information_actionable_effective → information_communication, lifesaving_behavior | ~ | Buq'ata. A dedicated WhatsApp group run by the KABAT plus a local Facebook group where updates arrive continuously — that is channel existence (`information_clarity`), not guidance that is "specific, situation-matched, and demonstrably leads to correct protective behavior". The `lifesaving_behavior` leg is unsupported: no behavior is described. Marginal on the information leg, ✗ on the life-saving leg. |
| 7 | sc_…c05ffe30 | community_volunteering → community_capital, belonging_solidarity | ✓ | Galilee Lower. Spontaneous volunteer organizing alongside authority-channelled volunteers, plus youth volunteering. Correctly typed and correctly routed to both components. |

**Spot-check tally: 2 ✓ / 3 ~ / 3 ✗ (37.5% clean).** Both polarity inversions (#2, #4) came from the same municipality, Sakhnin, whose PBO text mixes positive framing with negative content — suggesting the extractor is keying on register rather than on propositional content. Sakhnin does not appear in any component's visible contributors.

## Improvement Proposals

1. **Make `top_contributors` a real ranking, and stop filtering it to `grounded` only.** Currently it is `grounded ∩ primary`, first-10-in-file-order (verified: all 80 contributors are grounded+primary; all 8 lists are monotonic in array index). Two changes: (a) rank by an explicit salience score — intensity is a constant `"moderate"` today, so use grounding tier × confidence × scope_level × source-class weight, and persist the value on the contributor so the ranking is auditable; (b) include weak and unverified_critical signals in the surface with their tier displayed rather than excluding them, or add a parallel `suppressed_contributors` block. Expected impact: **all 8 components** for representativeness; decisive for `lifesaving_behavior`, where 37 of 50 primary signals are currently unreachable, and for `community_capital`, where 96 signals are represented by 4 alphabetically-early municipalities.

2. **Route `wellbeing_support_accessed` to `wellbeing_at_risk` (+/primary) and split it into provision vs. access.** The mirror gap is unambiguous: `wellbeing_support_gap` → `wellbeing_at_risk` −/primary, but `wellbeing_support_accessed` → `community_capital` +/primary only. Add the edge, and add `wellbeing_needs_mapping` (registries, home visits, at-risk mapping, monitoring mechanisms → `wellbeing_at_risk` +/primary) to capture GQ 1/GQ 3 evidence that today has no home — Deir al-Asad's name-and-place registry, Safed's four at-risk-group protocols, Buq'ata's continuous social-worker contact. Also tighten `wellbeing_support_accessed` so "the welfare department is operating" does not satisfy "individuals access support". Expected impact: **`wellbeing_at_risk`** moves off 2:47 by construction; **`community_capital`** stops absorbing 26 signals that are only partly its own.

3. **Fix the tiering asymmetry between asserted attitudes and reported behavior.** Every compliance/non-compliance signal in the report (24 of 24) is weak or unverified_critical, while attitudinal and institutional-activity signals are ~95% grounded. Safed's `risk_exposure_behavior` was demoted to `unverified_critical` even though the source states it was observed on municipal cameras — the verifier is not reading stated observation method. Two fixes: treat an explicit observation basis (cameras, patrols, counts, named incident) as a grounding *promoter*, and stop letting an official's unattributed attitudinal assertion ("נתפסים אמינים") reach `grounded` on two words. Expected impact: **`lifesaving_behavior`** (its entire evidence base), plus honest negative representation in **`leadership`** and **`information_communication`**.

4. **Add a within-record polarity guard and a same-sentence type-collision guard.** Two spot-check records (#2 Sakhnin narrative, #4 Sakhnin education) invert polarity — negative content typed as a positive-polarity signal. Add a check that flags a signal whose evidence contains explicit negation/deficit markers (פער, נפגע, לא, שאננות, עייפות, סגור) while carrying a `+` routing edge. Separately, Safed emitted three types from byte-identical evidence and Galilee Lower emitted three from one sentence; `_semantic_dedup_count` is 1 on all 284 signals, so dedup is inert. Enforce: identical evidence string ⇒ one signal with multiple type candidates resolved to the best fit, not N independent signals each carrying full weight. Expected impact: **`narrative`** and **`functional_continuity`** (polarity), **`information_communication`**, **`community_capital`**, **`belonging_solidarity`** (double-counting).

5. **Normalize visits `article_source` to a team identity.** `אנג'ל מנגוני וכארם שוקור` / `כארם שוקור ואנג'ל מנגוני` are one team counted twice, as are two other pairs; 12 source IDs represent 8 teams. Canonicalize by sorting participant names into a stable team key before assigning `source_id`. Expected impact: **`functional_continuity`** (`source_diversity: 1`, 9 near-duplicate healthcare findings) and any downstream corroboration count that treats these as independent.

6. **Add an othering/scapegoating signal type, and a source-class concentration flag.** `belonging_solidarity` GQ 3 has zero evidence across 284 signals in a demographically mixed region, and Safed's record — a religious minority behaving differently, described by the majority-authority — is exactly the material such a type would catch; without it the component reports 66:2 positive. Separately, PBO is 78.5% of signals but no single `article_source` exceeds 5%, so per-source concentration checks never fire; add a **source-class** concentration flag that trips when one class exceeds ~60%, and surface it alongside the existing self-assessment caveat. Expected impact: **`belonging_solidarity`** (closes the largest single evidence gap), and correct epistemic framing for **all 8 components**.

7. **Repair the degenerate audit fields, and reconcile `specialist_skipped` with `scores_reliable: true`.** `extraction_confidence` (constant 0.85), `evidence_basis` (constant `present_in_text`), `_semantic_dedup_count` (constant 1) and `scope_level` (`repeated_pattern` on 278/284) carry no information; either populate them or remove them, because the standard noise checks read them and return clean by construction. And a run where all 8 components report `specialist_not_run` with `narrative_grounding_score: null` should not also report `assessment_degraded: null` and `scores_reliable: true`. Expected impact: cross-cutting — restores the review and gating levers this whole procedure depends on.
