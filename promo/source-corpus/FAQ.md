# FAQ — srulik.ai (users & field)

> Answers grounded in `docs/MODEL-CARD.md`, `resilienceComponents.js`, and `footer.json`. Scope: the **user-facing core only** — internal scoring instruments and developer surfaces are out of scope (see `do-not-say.md`). Each answer ≤ ~80 words. No prediction language, no hero number, no "replaces" claims.

---

## What it is

**1. What is srulik.ai in one sentence?**
An evidence-backed daily homefront resilience assessment across eight community-resilience components — built from news, WhatsApp, radio, Google Trends, and field submissions. It structures the picture and shows the evidence; humans decide.

**2. Is this a news app or a dashboard?**
No. A news feed reports events; srulik.ai assesses how the community is *holding* across eight resilience components, with every claim traceable to its source. It's a decision-support instrument, not a feed and not a single-score app.

**3. Does it predict attacks or what will happen next?**
No — and it's designed not to. It assesses today's observable picture from signals already present in text. The model card is explicit: *"Not an oracle."* It structures the picture; it does not forecast.

**4. Does it replace developers or field officers?**
No. Replacing field-officer judgment is an explicit non-goal. It's decision-support: it suggests where to look and shows the evidence. People decide and act.

## The assessment

**5. What are the eight components?**
Narrative; Information & Communication; Effective Life-Saving Behavior; Functional Continuity; Community Capital; Leadership; Belonging & Solidarity; and Wellbeing of At-Risk Populations — the Home Front Command (Pikud HaOref) framework. See `8-COMPONENTS.md`.

**6. Where does the evidence come from?**
News, WhatsApp, radio/audio, Google Trends, and user submissions — plus PBO regional reports. Field, PBO, and WhatsApp reports sit alongside the digital signals in one assessment.

**7. Why don't users see a single 1–10 resilience score?**
Because a single number hides what's behind it and flattens eight distinct dimensions into one. Users see narrative and evidence instead. A community can have strong leadership and failing continuity at once — the components keep that visible.

**8. How is each component assessed?**
Behavioral signals are extracted from text against a closed vocabulary, evidence is verified, the eight components are assessed, and a narrative is written with inline citations. So the prose stays tied to the evidence behind it.

## Using it / contributing

**9. How does my field report get into the system?**
Three ways: upload a PBO regional report (markdown), send the WhatsApp report bot a short observation, or submit evidence manually. Your input becomes a signal in the next assessment.

**10. What can I ask the chat?**
Questions about the assessment and the evidence behind it — for today and across past reports. Chat can compare two dates, trace how a component evolved over time, and search the underlying sources, citing that evidence rather than the open internet. Good for "why is this component flagged?", "what changed since last week?", or "what should I verify in the field?"

**11. What scopes and languages are supported?**
Geographic scope: National and North. Languages: English, Hebrew, and Russian across the full UI. An opt-in daily email digest is available.

**12. Do I need to log in?**
Not by default — the daily assessment, evidence, and chat are available without sign-in. Sign-in adds preferences and digest sync.
