---
description: Chat module navigation — orchestrator entry and cross-module boundaries
paths:
  - "business_modules/chat/**"
---

<!-- Ported from .cursor/rules/chat-navigation.mdc — edit both together. -->

# Chat navigation

Read `business_modules/chat/AGENTS.md` before opening files in this tree.

## Start here

- `input/chatRoutes.js` — HTTP entry
- `app/chatLlmOrchestrator.js` — tool loop
- `app/chatService.js`, `app/chatToolHandlers.js`

## Do not load

- `business_modules/resilience_scorer/` prompts or assessment internals
- `daily_reports/` — use report context via composition-wired ports
