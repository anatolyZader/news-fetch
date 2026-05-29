---
title: "API Reference"
description: "Generated API reference from OpenAPI (single source of truth)."
intent: api
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/api"
version: "current"
tags: ["api"]
slug: /api
---

## Purpose
Give integrators a single place to find the API contract, explore endpoints interactively, and understand the contract-first philosophy behind Srulik's lab's HTTP surface. The endpoint-by-endpoint reference itself is generated from `openapi/openapi.yaml` — this page is your orientation to how to read and use it.

## Prerequisites
- **Required**: A reachable Srulik's lab instance (local or deployed).
- **Useful**: Comfort reading OpenAPI specs, or willingness to click around in Swagger UI.

## Inputs
- **HTTP requests** to the Srulik's lab API. Every endpoint, request shape, and response shape is defined in `openapi/openapi.yaml`.
- **An ID token** (if `AUTH_REQUIRED=true`) passed as `Authorization: Bearer <idToken>` for protected endpoints. See [Auth model](../concepts/auth-model.md).

## Outputs
- **JSON responses** for most endpoints, typed per the OpenAPI spec.
- **SSE streams** for endpoints that emit incremental progress (e.g., long analysis runs and some chat responses). Clients must support `text/event-stream` and treat timeouts as normal.
- **HTML** for the SPA (served at non-`/api` paths).

## Constraints
- **`openapi/openapi.yaml` is the source of truth.** Don't hand-edit the generated endpoint pages in `docs/product_docs/api/generated/` — they're regenerated on build from the YAML.
- **Auth is dynamic.** Endpoints that require auth reject calls without a valid Bearer token when `AUTH_REQUIRED=true`. Consult `/api/auth/config` at runtime to decide whether your client needs to sign in.
- **Stability varies.** Stable endpoints follow semver. Endpoints marked `x-beta` in the spec may change; pin to a server version if you rely on them.
- **SSE clients must be lenient.** Streaming endpoints can drop connections on intermediary proxies; clients should reconnect rather than fail hard.

## Key endpoints at a glance

| Endpoint | Purpose | Public? |
|---|---|---|
| `GET /api/openapi.json` | Full OpenAPI spec (programmatic) | Always |
| `GET /api/swagger` | Swagger UI (interactive) | Always |
| `GET /api/auth/config` | `{authRequired: bool}` | Always |
| `GET /api/docs/index` | Product docs index | Always (non-gated pages) |
| `GET /api/docs/page/:slug` | A product docs page | Public unless gated |
| `GET /api/report/today` | Today's cached assessment | Varies with auth |
| `GET /api/report/:date` | Assessment for a date | Varies with auth |
| `POST /api/chat` | Follow-up chat grounded in the report | Varies with auth |
| `POST /api/submissions` | Submit manual evidence | Varies with auth |

Full request/response shapes live in the generated pages and in Swagger UI.

## Examples

### Interactively explore the API

Open Swagger UI in your browser:

- Local: `http://localhost:3000/api/swagger`
- Production: `https://YOUR_HOST/api/swagger`

You can execute requests directly from the UI, including authenticated calls (paste in an ID token).

### Fetch the OpenAPI spec programmatically

```bash
curl -sS https://YOUR_HOST/api/openapi.json -o openapi.json
```

Use this to generate typed clients in your language of choice (openapi-generator, oapi-codegen, etc.).

### Check the auth posture before calling

```bash
curl -sS https://YOUR_HOST/api/auth/config
```

Response: `{"authRequired":true}` or `{"authRequired":false}`. Your client should call this on startup to decide whether to sign the user in before making protected requests.

### Call a protected endpoint

```bash
curl -sS \
  -H "Authorization: Bearer $ID_TOKEN" \
  https://YOUR_HOST/api/report/today
```

The ID token comes from Firebase Auth after sign-in (or from your own provider if you've adapted the auth wiring).

### Regenerate the docs API section after changing the spec

The Docusaurus build reads `openapi/openapi.yaml` and emits pages under `docs/product_docs/api/generated/**`. Rebuild the docs site to pick up changes:

```bash
cd docs/docs-site && npm run build
```

Don't hand-edit the generated pages — your changes will be overwritten.

## Troubleshooting
- **Reference looks out of date**
  - **Check**: whether `openapi/openapi.yaml` was updated in this release. The docs site regenerates endpoint pages from the YAML on every build.
  - **Fix**: update the YAML and rebuild the docs site. Don't patch the generated markdown directly.
- **Swagger UI is blank**
  - **Check**: `/api/openapi.json` returns valid JSON.
  - **Fix**: confirm the spec file exists on the server; see [Common failures](https://docs.vibeswitch.ai/operations/common-failures).
- **401 from every endpoint**
  - **Check**: `/api/auth/config` — if `authRequired: true`, you need a Bearer token.
  - **Fix**: sign in via the UI or mint an ID token via Firebase to use directly. See [Auth model](../concepts/auth-model.md).
- **SSE endpoint disconnects mid-stream**
  - **Check**: intermediate proxies for `text/event-stream` support and long timeouts.
  - **Fix**: configure the proxy (or move the client closer to the server). Your client should reconnect and resume.
- **Generated client code has missing endpoints**
  - **Check**: your local copy of `openapi.json` is current. Clients generated against a stale spec won't know about new endpoints.
  - **Fix**: re-download `openapi.json` and regenerate.
