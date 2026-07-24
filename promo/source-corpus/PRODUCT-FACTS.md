# Product Facts — srulik.ai

> **Bullet facts only — no marketing voice.** Auto-derived from `client/src/i18n/locales/{en,he}/footer.json`, `cross-cut-modules/resilience-contracts/resilienceComponents.js`, and `docs/MODEL-CARD.md`. Scope: the **operator-facing core only** — internal scoring instruments and analyst surfaces are deliberately omitted (see `do-not-say.md`). This is the factual substrate for copy; tone lives in `MESSAGING-HOUSE.md`. When the product changes, re-derive this file from those sources.

## What it is

- A daily homefront **decision-support** instrument for Home Front Command (Pikud HaOref) context.
- Extracts **observable behavioral signals** from multi-source text → assesses eight resilience components → generates operator-safe narratives with citations.
- Explicitly **not an oracle**: it structures the picture; humans decide.

## The eight components

Based on the eight-component Home Front Command community-resilience framework — an operational model theoretically informed by Norris et al. (2008), not a one-to-one implementation of Norris's four adaptive-capacity families. Community resilience = a community's ability, during and after crisis, to leverage resources, adapt, keep functioning, and provide essential services — to preserve the physical and mental health of its members.

| # | Component (EN) | Hebrew | What it measures (one line) |
|---|----------------|--------|------------------------------|
| 1 | **Narrative** | נרטיב | Whether the public story of coping strengthens or weakens endurance; credibility of the official narrative; competing frames. |
| 2 | **Information, Communication & Sharing** | מידע, תקשורת ושיתוף | Whether messaging is clear, credible, accessible to all sectors, and channels people toward life-saving behavior; rumor/misinformation gaps. |
| 3 | **Effective Life-Saving Behavior** | התנהגות אפקטיבית להצלת חיים | Whether the population actually follows protective guidelines; threat perception, knowledge, enforcement, trust in authority. |
| 4 | **Functional Continuity** | רציפות תפקודית | Whether essential services, workplaces, and schools keep operating; functional, identity, and interpersonal continuity. |
| 5 | **Community Capital & Resources** | הון ומשאבי קהילה | Whether community resources, volunteers, anchor organizations, and cross-sector cooperation are mobilized. |
| 6 | **Leadership** | מנהיגות | Whether formal/informal leadership is trusted, sets an example, and represents all segments. |
| 7 | **Belonging & Solidarity** | שייכות וסולידריות | Whether a sense of shared fate and mutual aid exists; whether any group is scapegoated/excluded. |
| 8 | **Physical & Mental Wellbeing (At-Risk Populations)** | דאגה לרווחה הפיזית והנפשית בדגש על אוכלוסיות סיכון | Whether vulnerable populations are identified and given adapted physical/emotional/informational responses. |

## Data sources (canonical wording)

> Data sources include news, WhatsApp, radio/audio, Google Trends, and user submissions.

- **News** — homefront news extraction.
- **WhatsApp** — report-bot inbox.
- **Radio / audio** — broadcast transcripts (e.g. ashams + tzafon).
- **Google Trends** — search-attention input.
- **Field / PBO reports** — regional markdown reports from Population Behavior Officers.
- **User submissions** — manual evidence uploads.

## How it works (pipeline)

```
LLM extract (closed vocabulary) → verify evidence → assess eight components → LLM narrate (with citations)
```

- Extraction uses a closed vocabulary of behavioral signals.
- Each component is assessed and given an operator-facing narrative; narratives carry inline `[source](url)` citations, translated to operator locale (HE/RU) on demand.

## Operator surface

- Each component shows a **narrative** plus an **evidence pool** of the raw excerpts behind it, for drill-down.
- **Chat:** ask questions about the assessment and its evidence — for today and across past reports. Tools include comparing two dates, tracing a component's evolution over time, and searching the source archive; answers cite that evidence.

## Scope & languages

- **Geographic scope:** National and North.
- **Languages:** English, Hebrew, Russian (full UI i18n).
- **Daily email digest:** opt-in mailing (`8 components — daily resilience report`), HE/EN/RU, server cron delivery.

## Access

- **General / operator:** daily assessment, evidence, chat, submissions, digest. No login required by default; sign-in adds preferences and digest sync.

## Non-goals (from model card)

- Measuring inner feelings or "true" societal mood.
- Autonomous resource dispatch without human review.
- Replacing field officer judgment.

## Brand assets

- Logos: `client/public/logo_srulik_1.png`, `logo_srulik_1_no_text.png`, `favicon_srulik_1.png`.
- Footer columns: Product · Help · Legal. Footer links: Get started, How scoring works, Data handling, Terms of use, Contact support.
