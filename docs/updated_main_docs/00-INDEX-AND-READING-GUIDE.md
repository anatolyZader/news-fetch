# 00 - Index and Reading Guide

## What this answers

- What this documentation set is, who it is for, and how to load it into NotebookLM.
- Which file answers which question.
- The non-negotiable framing that runs through every file: this is a **decision-support system**, not a scoring engine.

## What this system is (one paragraph)

**Srulik's lab** is a homefront **decision-support** application (Node/Fastify API + React SPA) that helps a **district-level population-behavior officer** understand how the civilian population in the **northern district of Israel** is coping, day by day. It ingests heterogeneous district data (news, radio, WhatsApp, field visits, social OSINT, municipal and regional PBO dashboards, weekly questionnaires), runs a **dual-path analysis** (an open, free-form observation path that is *primary*, and a closed, vocabulary-based path that is *supporting*), and produces **evidence-backed claims** assembled by an **assessment agent**. Humans read the evidence and decide. The system never auto-dispatches anything, and "we don't have enough evidence" (**abstention**) is a valid, first-class answer.

## Who this is for

| Reader | Use |
|--------|-----|
| District population-behavior officer (operator) | The decision-support model, what a report says, how to read uncertainty (files 01, 04, 05, 06) |
| Analyst / methodologist | How the de-emphasized scoring works and why it is hidden from operators (files 02, 05) |
| Engineer / new contributor | End-to-end pipeline, artifacts, file-path traceability (files 02, 03, 04, 07) |
| NotebookLM workflows | This index + the study prompts in file 07 |

## File map

| File | Title | Answers |
|------|-------|---------|
| `00-INDEX-AND-READING-GUIDE.md` | Index and reading guide | This page: orientation + NotebookLM usage |
| `01-MISSION-AND-OPERATOR-MODEL.md` | Mission and operator model | Why decision support, not scoring; who the operator is; the twice-daily report workflow; why abstention is valid |
| `02-DUAL-PATH-PIPELINE.md` | The dual-path pipeline | Open analysis (primary) vs closed vocabulary (supporting); how they merge; orchestration; artifacts |
| `03-DATA-SOURCES-AND-GEOGRAPHY.md` | Data sources and geography | Every ingestion source; the northern-district geographic model; scope filtering |
| `04-ASSESSMENT-AGENT.md` | The assessment agent | Planner -> specialists -> critic -> synthesizer; evidence graph; claims; decision brief |
| `05-EPISTEMICS-AND-INSTRUMENTS.md` | Epistemics and instruments | Evidence mass, source caps, certainty, instrument state; why the 1-10 score is hidden |
| `06-REPORTS-DELIVERY-AND-CHAT.md` | Reports, delivery, and chat | Report artifacts, HTTP API, scopes, report builder vs report bot, UI, chat tools |
| `07-GLOSSARY-TRACEABILITY-AND-PROMPTS.md` | Glossary, traceability, prompts | Glossary, stage -> file -> artifact table, ready-to-paste NotebookLM prompts |

## The throughline (repeated in every file)

1. **Decision support, not scoring.** The primary product is the assessment agent's **evidence-backed claims** plus **operator instruments** (sufficiency, contested, attention items, decision brief). A headline 1-10 resilience score still exists internally but is **shadow/analyst-only** and is **redacted from operators** at the API and UI layer (`display_view`). See file 05.
2. **Open is primary; closed is supporting.** The **open path** extracts free-form behavioral observations with no fixed vocabulary and feeds the agent's investigation. The **closed path** maps observations to a fixed catalog (the 8-component Home Front Command model) and drives the structured, de-emphasized scoring. See file 02.
3. **District officer, not local first responder.** The intended user is a **northern-district population-behavior officer** who produces **two thoughtful situation reports per day** from district-wide data - not a local emergency specialist who must react to each incident in real time. See file 01.
4. **Abstention is valid.** "Insufficient data" is a deliberate outcome at the planner, specialist, critic, scoring-gate, instrument, and UI layers. It is never silently converted to "all clear." See files 04 and 05.

## How to use these files in NotebookLM

1. Upload **all eight files** as sources in one notebook. They are written to be independently retrievable (each repeats just enough context) but cross-reference each other by number.
2. In the notebook's source instructions, ask the model to:
   - **Cite the file number and section** in answers.
   - Treat **code locations** (file paths and function names quoted here) as authoritative over prose paraphrases.
   - Distinguish **decision-support outputs** (claims, instruments, attention items) from the **de-emphasized headline score**.
3. For "where is X implemented?" questions, point the model at the traceability table in file 07 first.
4. Use the study prompts in file 07 as a starting question bank or as flashcards.

## Accuracy notes (read before trusting any cadence claim)

- **Report cadence.** "Twice daily" describes the **officer's operational responsibility / workflow**, not a built-in scheduler. In code, the bundled cron example runs the pipeline **once daily, Sunday-Thursday, at 15:00 Israel time** (`scripts/README.md`, `scripts/daily-pipeline.sh`). The assessment CLI stamps each run with an `HHMM` time suffix, so multiple runs per day are fully supported, and the report cache picks the "best" report for a given date. Where this document says "twice daily," it means the human cadence the system is designed to support, not an automated job.
- **Scopes.** Only two report scopes exist in code: `national` and `north`. "North" means the **entire northern district** across its subregions (`naftali`, `golan`, `baram`, `hiram`, `galma`), not a single town.
- **Source of truth.** This set was written from the current codebase. Where prose and code disagree, the code wins. Key anchors are listed in file 07.

## Version note

Written against the repository layout under `business_modules/resilience/`, `business_modules/resilience_assessment/`, `business_modules/signals_extraction/`, `cross-cut-modules/resilience-contracts/`, and the batch CLIs `extract-signals.js` / `assess-signals.js` / `run-pipeline.js` as of authoring. These files supersede the older `docs/reviews/8-component-resilience-pipeline-notebooklm.md` for NotebookLM purposes; that older document is score-centric and predates the agent-primary, dual-path model described here.
