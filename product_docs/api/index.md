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
Provide a strictly factual API reference generated from the OpenAPI specification.

## Prerequisites
- **Required**: Access to the VibeSwitch API endpoint you’re integrating with.

## Inputs
- **Requests**: HTTP requests described in the generated reference below.

## Outputs
- **Responses**: JSON payloads and SSE streams, per endpoint.

## Constraints
- **Source of truth**: `openapi/openapi.yaml` (do not manually edit generated endpoint pages).
- **Auth**: endpoints may require a Bearer JWT depending on server config.

## Examples
- Use Swagger UI for interactive exploration when available: `/api/swagger`
- Fetch the OpenAPI JSON: `/api/openapi.json`

## Troubleshooting
- **Reference looks out of date**\n  - **Check**: whether `openapi/openapi.yaml` was updated\n  - **Fix**: update the OpenAPI spec and regenerate docs during build

