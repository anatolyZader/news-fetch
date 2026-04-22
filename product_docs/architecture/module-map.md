---
title: "Module map"
description: "Where to extend the system: business modules, cross-cutting modules, UI."
intent: architecture
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/architecture/module-map"
version: "current"
tags: ["architecture", "internals"]
---

## Purpose
Orient an integrator or developer to the repo's top-level layout so they can answer "where does this change belong?" in under a minute. This is the companion to [System overview](system-overview.md), but at the directory level rather than the subsystem level.

## Prerequisites
- **Required**: Familiarity with Node.js + React project layouts.
- **Useful**: A local clone of the repo to tab through while reading.

## Inputs
- **A change you want to make**: a new ingestion source, a new signal type, a new UI surface, a new operational script, a new cross-cutting utility.
- **The symptom you're debugging** (if applicable): something in the UI, the API, or a CLI script.

## Outputs
- **A directory** where the change belongs.
- **A sense of what you should *not* change** in the same PR to keep the blast radius small.

## Constraints
- **Keep business logic modular.** A feature specific to WhatsApp goes under `business_modules/whatsapp/`. If it touches news too, it's either two features or it belongs in a cross-cut module.
- **Keep cross-cutting concerns shared.** Persistence, budget tracking, LLM clients — don't duplicate these per business module.
- **UI presents, it does not compute.** The React app renders data returned by the API. Analysis, normalization, and scoring live in the server modules.
- **Scripts are interfaces, not logic.** The `package.json` scripts and `scripts/*.sh` are thin wrappers that call into the modules. Don't write significant logic in shell.

## Top-level layout

```
/
├── app.js, server.js          # Fastify app + entry point
├── package.json               # Scripts + deps
├── openapi/openapi.yaml       # API contract (source of truth)
├── product_docs/              # These docs (served in-app and by docs-site)
├── docs-site/                 # Docusaurus site configured to read product_docs
├── scripts/                   # Shell wrappers + validators
│   ├── daily-pipeline.sh      # End-to-end daily run
│   └── docs/validate-docs.js  # `npm run docs:check`
├── business_modules/
│   ├── news-sites/            # NewsAPI.ai + homefront extractor
│   ├── whatsapp/              # Meta Cloud API webhook + stores + export
│   ├── audio/                 # Whisper transcription + markdown export
│   ├── video/                 # YouTube / video ingest
│   ├── recording/             # Scheduled stream recorders
│   ├── radio/                 # Radio station specifics
│   ├── resilience/            # Signal extraction + assessment
│   ├── translation/           # On-demand report translation
│   ├── chat/                  # Follow-up chat grounded in reports
│   ├── edu, education/        # Education ministry data
│   ├── pbo_report_muni/       # Municipality data
│   ├── naftali/               # Political figure activity
│   ├── survey/                # Survey analysis
│   └── docs/                  # In-app docs surface helpers (if present)
├── cross-cut-modules/
│   ├── budget/                # Cost accounting, caps, cost-log
│   └── ...                    # Persistence helpers, LLM clients, shared utils
├── client/
│   └── src/                   # React SPA (Docs panel, dashboards, tabs)
├── tests/                     # node --test suite
└── utils/                     # Small shared server utilities (e.g. productDocs.js)
```

## Examples

### I want to add a new ingestion source

1. Create `business_modules/<source>/` with `input/` for CLI entry points and a `reports/` or `articles_extracted/` dir for dated markdown exports.
2. Match the markdown format downstream extraction expects — look at `business_modules/news-sites/articles_extracted/` for a reference.
3. Add an `npm run` script in `package.json` pointing at your entry point.
4. (If using an LLM) route calls through the cross-cut LLM client so budget tracking works out of the box.
5. Write a guide under `product_docs/guides/` describing how to use it.

### I want to add a new signal type

1. Update the taxonomy (list of allowed `signal_type` values) in `business_modules/resilience/`.
2. Add the type to the extraction prompt's allowed values.
3. Add a weight for it in the signal→component mapping.
4. Decide whether to backfill older days — rerunning extraction lets old reports surface the new type.
5. Bump whatever version / changelog you use; silent taxonomy changes create silent score drift.

### I want a new tab in the UI

1. Create a component under `client/src/components/<YourTab>.jsx` with its own CSS module.
2. Expose data via a new API route in `app.js` that delegates to a `business_modules/<domain>/` module.
3. Wire the tab into `client/src/MainApp.jsx` — add it to the `TABS` array and the switch that renders tab content.
4. Add translations for the tab label in the language context.
5. If the tab should appear in the Docs panel, write a guide in `product_docs/guides/` — the panel picks it up automatically.

### I want a new CLI operation

1. Put the entry point in the relevant business module's `input/` directory.
2. Add an `npm run <name>` script that invokes it.
3. Include it (or document inclusion) in `scripts/daily-pipeline.sh` if it's a regular daily step.
4. Treat env vars as the input contract — document them in the command's README or in the doc guide that references it.

### I need a new cross-cutting utility

- **Criterion**: two or more business modules would otherwise copy the same code.
- **Location**: `cross-cut-modules/<concern>/` with clean entry points.
- **Don't**: hide business logic here. If only one module uses it, it belongs in that module.

## Troubleshooting
- **Not sure where to add a new adapter**
  - **Check**: is it ingestion (source adapter) or analysis (signals / scoring)?
  - **Fix**: add ingestion under its own `business_modules/<source>/`; keep scoring and taxonomy in `business_modules/resilience/`.
- **My feature ended up spanning five directories**
  - **Check**: whether the feature is actually several features, or whether you're touching cross-cut utilities.
  - **Fix**: split the PR. Cross-cut changes ship on their own; each business module change rides on top.
- **UI code has grown a private understanding of signals**
  - **Check**: whether the client is parsing or reshaping analysis output.
  - **Fix**: move that shape-logic into the API response. The client should consume ready-to-render data.
