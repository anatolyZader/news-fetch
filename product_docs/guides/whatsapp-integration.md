---
title: "WhatsApp integration"
description: "Ingest WhatsApp conversations and produce behavioral signals and reports."
intent: guides
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/guides/whatsapp-integration"
version: "current"
tags: ["whatsapp", "integration", "guides"]
llm:
  chunkHint: "Make each step actionable with checks."
---

## Purpose
Set up WhatsApp ingestion so messages can be analyzed and turned into structured outputs.

## Prerequisites
- **Required**: Meta WhatsApp Cloud API credentials
- **Required**: Ability to configure environment variables on the server

## Inputs
- **Webhook events**: Meta delivery payloads
- **Allowed groups**: identifiers configured in `WHATSAPP_ALLOWED_GROUP_IDS`

## Outputs
- **Stored messages**: persisted for analysis
- **Signals / drafts**: generated from the ingested content (when enabled)

## Constraints
- **Verify token**: webhook setup requires a stable `WHATSAPP_VERIFY_TOKEN`
- **Security**: avoid logging full message contents in production logs

## Examples
High-level configuration checklist:
- Set `WHATSAPP_VERIFY_TOKEN`
- Set `WHATSAPP_ACCESS_TOKEN`
- Set `WHATSAPP_PHONE_NUMBER_ID`
- (Optional) set `ANTHROPIC_API_KEY` to enable higher-level analysis

## Troubleshooting
- **Webhook verification fails**\n  - **Check**: `WHATSAPP_VERIFY_TOKEN` matches Meta configuration\n  - **Fix**: update the token in the Meta console and redeploy

