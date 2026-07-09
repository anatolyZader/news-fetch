# 07 - Glossary, Traceability, and NotebookLM Prompts

## What this answers

- A consolidated **glossary** of every term used across files 00-06.
- A **stage -> file -> artifact** traceability table for "where is X implemented?" questions.
- A set of ready-to-paste **NotebookLM study prompts**.

## 1. Glossary

| Term | Definition |
|------|------------|
| **Decision-support system** | The product's identity: it organizes evidence and reasons about it so a human can decide. It is not an automated scorer or alerter. |
| **Population-behavior officer** | The intended user: a district-level officer who produces situation reports from district-wide behavioral data (not a local first responder). |
| **Northern district / `north` scope** | The whole northern district of Israel, aggregated across subregions `naftali`, `golan`, `baram`, `hiram`, `galma`. One of two scopes (`national`, `north`). |
| **Twice-daily report** | The officer's operational workflow (two reports per day). Supported by `HHMM`-suffixed runs; not a built-in scheduler (cron example is once-daily). |
| **Dual-path pipeline** | Two parallel extraction tracks: open (primary) and closed (supporting), merged at assess time. |
| **Open analysis / open observation** | Free-form behavioral extraction with no fixed vocabulary and no scoring; the primary input to the assessment agent. Artifact: `observations-pipeline-{source}-{date}.json`. |
| **Closed vocabulary / signal** | Extraction typed against the fixed `SIGNAL_CATALOG`; the supporting, structured, scorable path. Artifact: `signals-{source}-{date}.json`. |
| **8-component model** | The Home Front Command resilience decomposition: `narrative`, `information_communication`, `lifesaving_behavior`, `functional_continuity`, `community_capital`, `leadership`, `belonging_solidarity`, `wellbeing_at_risk`. |
| **`SIGNAL_TO_COMPONENTS`** | Many-to-many signed weights mapping a closed signal type to one or more components. |
| **`RESILIENCE_OPEN_EXTRACT_PARALLEL`** | Env flag; empty/unset means the open path is ON (default). |
| **Assessment agent** | The planner -> specialists -> critic -> synthesizer pipeline that produces claim-backed component assessments (`runAssessmentAgent`). |
| **Planner** | Builds the investigation plan, including `abstention_components`. |
| **Component specialist** | Per-component investigator; runs at depth A/B/C. |
| **`specialist_depth` (A/B/C)** | The agent's internal investigation depth / token economy. Not the same as `display_view`. |
| **Critic** | Deterministic per-component checks that downgrade over-claims and enforce grounding. |
| **Synthesizer** | Produces cross-component synthesis, attention items, and the decision brief. |
| **Evidence graph** | Graph of sources/chunks/signals/hypotheses/OOV clusters with per-component claims; the merged substrate the specialists reason over. |
| **Claim** | A grounded statement with `text`, `evidence_refs` / `support` / `contradict`, polarity, and epistemic flags. The atomic unit of decision support. |
| **Evidence tree** | The per-component claim set surfaced to UI/API. |
| **Decision brief** | Advisory summary + priority items; forbidden from using numeric 1-10 scores or claiming dispatch. |
| **Attention items** | Ranked queue of what deserves a closer look. |
| **Action compass** | Ranked operator actions under uncertainty, without numeric scores. |
| **Abstention / `insufficient_data`** | A valid first-class outcome when evidence is too thin; never rendered as "all clear." |
| **Evidence mass** | Sum of capped positive and negative contributions; how much evidence landed on a component. |
| **Source cap** | Limits one `source_type` to 50% and one `article_source` to 35% of polarity mass (anti echo-chamber). |
| **Certainty** | `1 - exp(-evidence_mass / certM)`; continuous strength-of-evidence measure. |
| **Instrument** | Operator-facing evidence-quality readout (sufficiency, contested, significant delta, status) that replaces the headline score. |
| **`display_view` (operator/analyst)** | API/UI redaction tier. Operators never see numeric scores; analysts (allow-listed) do. |
| **Headline 1-10 / `overall_resilience_score`** | The de-emphasized deterministic score. Computed via `scoringFacade.js`, used as a shadow/analyst artifact, set to null and redacted for operators. |
| **Shadow scoring** | The deterministic score run alongside the agent for analyst comparison/divergence. |
| **OOV capture** | Out-of-vocabulary observations buffered for catalog evolution. |
| **Catalog evolution** | Turning OOV/verified-open observations into gap reports and draft catalog proposals. |
| **`business_modules/resilience_scorer/data/reports/`** | Output directory for assessment artifacts (`.md`, `-brief.md`, `.json`). |
| **report_build** | Interactive field-report drafting module (input source), distinct from the daily assessment. |
| **report_bot** | Read-only inbox of manually submitted reports. |

## 2. Traceability: stage -> file -> artifact

| Stage | Primary implementation | Artifact / outcome |
|-------|------------------------|--------------------|
| Ingest (textual) | `business_modules/{news-sites,audio,whatsapp,visits,pbo_report_regional}/...` | Markdown corpora |
| Ingest (structured) | `business_modules/{pbo_report_muni,pool,social_media}/...` | Direct signal/observation bundles |
| Closed extract (supporting) | `business_modules/resilience_scorer/input/extract-signals.js`, `infrastructure/claudeExtraction.js` | `resilience_scorer/data/signals/signals-{source}-{date}.json` |
| Open extract (primary) | `business_modules/open_observation_extraction/app/pipelineOpenExtractService.js` (`runPipelineOpenExtract`) | `open_observation_extraction/data/observations-pipeline-{source}-{date}.json` |
| Canonical paths | `business_modules/resilience_scorer/domain/services/pipelineArtifactPaths.js` | path helpers |
| Orchestrate | `business_modules/resilience_scorer/input/run-pipeline.js`, `app/pipelineOrchestrator.js`, `app/pipelineIngestPlan.js` | ingest plan + spawns |
| Assess: load both paths | `business_modules/resilience_scorer/app/assessment/assessSignalsCli.js`, `app/assessment/loadOpenObservationsForAssess.js` | merged in-memory inputs |
| Route open obs to components | `business_modules/open_observation_extraction/domain/services/openObservationRouter.js` (`routeOpenObservations`) | `scoring.openObservations` |
| Epistemic profile | `business_modules/resilience_scorer/domain/epistemic/epistemicProfileBuilder.js` | mass, certainty, caps |
| Assessment agent | `business_modules/specialist_agents/app/assessmentOrchestrator.js` (`runAssessmentAgent`) | `assessmentV2` (claims, synthesis, brief) |
| Planner / specialist / critic / synthesizer | `plannerAgent.js` / `componentSpecialistAgent.js` / `criticAgent.js` / `synthesizerAgent.js` | plan, component assessments, repairs, synthesis |
| Evidence graph | `cross-cut-modules/retrieval/evidenceGraph.js` (`buildEvidenceGraph`) | per-component claims graph |
| Shadow score (de-emphasized) | `business_modules/resilience_scorer/app/scoringFacade.js` (-> `business_modules/resilience_scorer/analyst/scoring/`) | numeric scores (analyst-only) |
| Score abstention gate | `business_modules/resilience_scorer/domain/services/dataVoid/epistemicGate.js` | null score + `epistemic_abstention` |
| Operator instrument + redaction | `business_modules/resilience_scorer/domain/services/assessmentDisplayTier.js` | instrument; operator redaction |
| Display view | `cross-cut-modules/resilience-contracts/displayViews.js` | operator vs analyst |
| Scope filter | `business_modules/resilience_scorer/domain/services/regionSignalFilter.js`, `IReportScopePolicy.js` | scope-local signals |
| Catalog evolution | `business_modules/signal_catalog_evolution/`, `resilience/app/enqueueVerifiedOpenForCatalog.js` | gap reports, proposals |
| Write report | `business_modules/resilience_scorer/infrastructure/reportWriter.js` (`writeReport`) | `business_modules/resilience_scorer/data/reports/{scope}-{date}-{HHMM}.{md,brief.md,json}` |
| Serve report | `business_modules/resilience_scorer/input/reportRoutes.js`, `app/reportCacheService.js` | HTTP API |
| Operator UI | `client/src/components/ReportView.jsx` | operator view |
| Chat | `business_modules/chat/app/chatLlmOrchestrator.js`, `chatService.js` | tool-driven Q&A |
| Field report intake | `business_modules/report_build/app/reportBuildService.js` | drafted `field` source |

## 3. NotebookLM study prompts

Paste these against a notebook containing files 00-07.

1. In one paragraph, explain why this is a decision-support system and not a scoring mechanism. Cite the redaction layer.
2. Who is the intended operator, and how does their job differ from a local emergency responder? (File 01.)
3. What does "twice daily" actually mean here, and what does the code schedule? Be precise about the difference.
4. Describe the dual-path pipeline. Which path is primary, which is supporting, and why? (File 02.)
5. What does open extraction deliberately NOT do, per the prompt rules?
6. Name the artifact filenames for the open path and the closed path, including the directory.
7. List the eight components in canonical order. Where are the ids defined?
8. Walk through the assessment agent stages from planner to synthesizer, naming the function for each. (File 04.)
9. What is the difference between `specialist_depth` (A/B/C) and `display_view` (operator/analyst)?
10. Define a "claim" and list its fields. Why are claims the unit of decision support?
11. How is abstention enforced at the planner, specialist, critic, and scoring layers?
12. Explain evidence mass, the 50%/35% source caps, and certainty. What failure mode do the caps prevent?
13. List every layer that hides or nulls the headline 1-10 score for operators. (File 05.)
14. What is the operator "instrument," and which fields does it expose instead of a score?
15. How is a report scoped to the northern district? Describe the three ways a signal can be kept for `north`. (File 03.)
16. What three files does each assessment run write, and how do they differ?
17. Distinguish `business_modules/resilience_scorer/data/reports/`, `report_build`, and `report_bot`. (File 06.)
18. How does a verified open observation feed back into the closed catalog over time?
19. Using the traceability table, map "scope filtering" and "evidence graph" to their files.
20. Why is an honest "insufficient_data" considered a correct answer in this system?

## 4. Disclaimer pointer

These documents describe behavior, not policy. Operational limits, the model card, and product disclaimers live in `docs/MODEL-CARD.md`. Outputs are assessment-support, bounded by ingestion coverage, source mix, and extraction error, and are deliberately tuned to favor honesty about uncertainty over headline confidence. Always pair any output with evidence review before high-stakes use.
