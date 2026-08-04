---
description: OpenAPI contract-first — read spec before route implementations
paths:
  - "openapi/**"
  - "business_modules/*/input/*Routes.js"
  - "cross-cut-modules/*/input/*Routes.js"
---

<!-- Ported from .cursor/rules/openapi-contract.mdc — edit both together. Globs widened: the rule governs route edits, not just the spec. -->

# OpenAPI contract-first

Read `openapi/openapi.yaml` for API shape before opening route implementations.

## Find implementations

- Route handlers live in `business_modules/*/input/*Routes.js` or `cross-cut-modules/*/input/*Routes.js`
- Open only the route file for the endpoint you are changing

## Do not

- Read every `*Routes.js` file in the repo
- Change API behavior without updating `openapi/openapi.yaml`
