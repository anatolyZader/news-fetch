---
title: "Common failures"
description: "Operational playbook for frequent failure modes and how to resolve them."
intent: playbooks
audience: ["customer", "internal"]
stability: beta
canonical: "https://docs.vibeswitch.ai/playbooks/common-failures"
version: "current"
tags: ["playbooks", "operations", "troubleshooting"]
llm:
  chunkHint: "Use if/then diagnostic flows."
---

## Purpose
Reduce time-to-recovery by mapping symptoms to checks and fixes.

## Prerequisites
- **Required**: Access to server logs and environment configuration

## Inputs
- **Symptom**: what the operator observes (UI message, API error, missing outputs)

## Outputs
- **Action plan**: a deterministic sequence of checks and fixes

## Constraints
- **Gating**: this page is intended to be access-controlled in the in-app docs surface

## Examples
If the UI says “API key is required”:
- Check `NEWSAPI_API_KEY` is set
- Restart the service

## Troubleshooting
- **Upstream unavailable**\n  - **Check**: upstream provider status and network egress\n  - **Fix**: retry with backoff; capture the error and provide a user-facing fallback

