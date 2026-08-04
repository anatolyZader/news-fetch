---
description: Enforce module structure (app, domain, infrastructure; input optional) and file layout for business_modules
paths:
  - "business_modules/**"
  - "cross-cut-modules/**"
  - "tests/business_modules/**"
---

<!-- Ported from .cursor/rules/module-structure.mdc — edit both together. This file is now the canonical module-structure schema (the previously cited .cursor/skills/create-business-module/SKILL.md no longer exists). -->

# Module Structure (MANDATORY)

When creating or extending a **business module**, follow this structure and naming so the agent and codebase stay consistent. This rule is the canonical module-structure schema (directory tree, per-layer contract, naming rules, dependency flow); no need to re-analyze existing modules to infer it.

## 1. Directory layout per module

Every business module lives under `business_modules/<moduleName>/` with app, domain, and infrastructure; input is optional.

```
business_modules/<moduleName>/
├── index.js                    # Optional: barrel or entry for the module
├── input/                      # INPUT LAYER — optional; only when module has a transport entry (HTTP, events, pub/sub, etc.)
│   └── <module>Input.js          # or <module>EventListener.js, <module>Router.js (by type). Omit input/ when only in-process callers.
├── app/                        # APPLICATION LAYER — controller (or service) is the entry when only in-process callers
│   ├── <module>Controller.js   # Optional: accept request/message, extract data, call Service
│   ├── <module>Engine.js       # Optional: main orchestrator for the module
│   ├── <module>Service.js      # Main application service
│   └── <subdomain>/            # Optional subdirs for large modules (e.g. classification/, scoring/)
│       └── ...
├── domain/                     # DOMAIN LAYER — entities, value objects, ports (interfaces)
│   ├── entities/
│   ├── value_objects/
│   ├── events/
│   ├── aggregates/
│   ├── ports/                  # I<Module><Port>.js
│   └── services/               # Domain services (pure logic)
└── infrastructure/             # INFRASTRUCTURE LAYER — adapters implementing ports
    └── adapters/
        └── <module><Thing>Adapter.js
```

- **Input (optional):** Only when the module receives from a transport (HTTP, events, pub/sub, CLI, etc.). Receive only; resolve app Controller or Service from DI and delegate. **When the module is only called in-process by other modules, omit input/** — the app controller (or service) accepts the call, extracts data, and calls the service.
- **App**: Controller (optional) accepts request/message, extracts data, calls Service. When there is no input layer, the app controller or service is the module entry. Services and engines orchestrate domain and call ports; no direct DB/FS/VS Code.
- **Domain**: Entities, aggregates, ports (interfaces); no imports from app or infrastructure.
- **Infrastructure**: Adapters (VSCode, persistence, external APIs); implement domain ports.

## 2. File and type naming

| Layer        | Location              | Naming pattern (examples) |
|-------------|------------------------|----------------------------|
| Input       | `input/`               | `<module>Input.js`, `<module>EventListener.js`, `<module>Router.js`, `<module>PubsubListener.js` — by file type |
| App         | `app/` or `app/<subdomain>/` | `<module>Service.js`, `<module>Controller.js` (optional), `<module>Engine.js` |
| Domain      | `domain/entities/`, `domain/value_objects/`, `domain/events/`, `domain/ports/` | Entities/value objects/events: PascalCase. Ports: `I<Module><Port>.js` (e.g. `IAwarenessVSCodePort.js`) |
| Infrastructure | `infrastructure/adapters/` | `<module><Thing>Adapter.js` (e.g. `awarenessVSCodeAdapter.js`) |

- Use **camelCase** for file names (e.g. `awarenessEngine.js`, `planDeviationClient.js`).
- **Port interfaces**: `I` + Module name + Port name (e.g. `IAwarenessPersistencePort.js`).

## 3. Test layout (mirror structure)

Place tests under `tests/business_modules/<moduleName>/` mirroring the source tree:

- `business_modules/<module>/app/foo.js` → `tests/business_modules/<module>/app/foo.test.js`
- `business_modules/<module>/domain/entities/Bar.js` → `tests/business_modules/<module>/domain/entities/Bar.test.js`
- `business_modules/<module>/infrastructure/adapters/bazAdapter.js` → `tests/business_modules/<module>/infrastructure/adapters/bazAdapter.test.js`

Use `__tests__/` subdirs only when you group multiple test files for one area (e.g. `app/scoring/__tests__/`).

## 4. Rules when adding new code

- **New module**: Create `app/`, `domain/`, and `infrastructure/adapters/`; add `input/` only when the module has a transport entry (HTTP, events, pub/sub, etc.). When only in-process callers, the app controller (or service) is the entry.
- **New feature in existing module**: Add files in the correct layer; use existing subdirs (e.g. `app/usage/`, `app/scoring/`) when they fit.
- **Cross-cutting code**: Put it in `cross-cut-modules/`, not inside a single business module. Keep it stateless and pure where possible.
- **Composition**: Wire new modules in `compositionRoot.js`; resolve app controller or service from DI (from input layer when present, or directly when module has no input); do not import one business module from another — use ports/events or composition root.

## 5. References

- Detailed rationale: `docs/ARCHITECTURE-COMPARISON.md`, `docs/APP-DIRECTORY-ORGANIZATION-RATIONALE.md`.
