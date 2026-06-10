# Chat module — agent entry

Read this before any file under `business_modules/chat/`.

## Entry

- `index.js` — lookup/query exports only; not the HTTP entry
- `input/chatRoutes.js` — HTTP routes
- `app/chatService.js` — session + turn handling
- `app/chatLlmOrchestrator.js` — LLM tool loop
- `app/chatToolHandlers.js` — tool implementations

## Ports (`domain/ports/`)

`IChatLlmPort`, `IChatSessionStorePort`, `IChatPendingActionStorePort`

## Do not read

- `business_modules/resilience/` prompts or assessment internals
- `daily_reports/` — use report read ports / APIs wired at composition

## Neighbors

- Report payload via ports wired in `composition/createApp.js` (`chatRoutes` registration)
