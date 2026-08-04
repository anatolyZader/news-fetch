---
description: Resilience module navigation — start points and do-not-read paths
paths:
  - "business_modules/resilience_scorer/**"
  - "business_modules/specialist_agents/**"
---

<!-- Ported from .cursor/rules/resilience-navigation.mdc — edit both together. -->

# Resilience navigation

Read `business_modules/resilience_scorer/AGENTS.md` before opening files in this tree.

## Start here

- `business_modules/resilience_scorer/index.js` — facade first
- CLI: `input/extract-signals.js`, `input/assess-signals.js`
- HTTP: `input/reportRoutes.js`
- Assessment agent: `business_modules/specialist_agents/app/assessmentOrchestrator.js`

## Do not load

- `validation/artifacts/`, `tuning/golden/` unless task says validation or golden eval
- Prompt files unless task explicitly says "prompt"
- Sibling modules — use composition-wired ports only
