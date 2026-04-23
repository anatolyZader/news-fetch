---
title: "WhatsApp integration"
description: "Ingest WhatsApp conversations and produce behavioral signals and reports."
intent: guides
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/guides/whatsapp-integration"
version: "current"
tags: ["whatsapp", "integration", "guides", "user"]
llm:
  chunkHint: "Make each step actionable with checks."
---

## What you get when WhatsApp is connected
When WhatsApp is connected, messages from approved groups become part of the evidence used in the daily assessment. That means:
- you can see WhatsApp-driven evidence behind a score
- the assessment can reflect community sentiment and on-the-ground reports faster than news
- operators can audit what was ingested for a given day (for privacy and accuracy)

WhatsApp is sensitive. Treat message content as private by default.

## What you will see in the app
- In the **Report** tab, some evidence items will cite WhatsApp as a source.
- If your deployment shows source breakdowns, WhatsApp will appear as one of the inputs for the day.
- You may be able to drill into evidence excerpts (depending on your privacy settings).

## Operator setup (one-time)
If you’re not the operator: you can stop here and send this page to the person who manages the deployment.

The operator configures:
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_ALLOWED_GROUP_IDS`

Then registers the webhook endpoint in Meta as `https://YOUR_HOST/api/whatsapp/webhook`.

## Troubleshooting

- **Webhook verification fails**
  - **Check**: `WHATSAPP_VERIFY_TOKEN` in your env matches the value in the Meta console exactly (no trailing whitespace).
  - **Fix**: update one side, redeploy, and re-verify from the Meta console.
- **Verification passes but no messages arrive**
  - **Check**: the group is in `WHATSAPP_ALLOWED_GROUP_IDS`, and you've subscribed to the `messages` field in the Meta console.
  - **Fix**: add the group ID, subscribe to the field, then send a fresh message.
- **401 / `OAuthException` from Meta on outbound calls**
  - **Check**: `WHATSAPP_ACCESS_TOKEN` is current and not expired.
  - **Fix**: rotate the token in the Meta console, update the env, and restart.
- **Export file has zero messages for a date you expect to be busy**
  - **Check**: ingestion was actually running and receiving webhooks on that date (server logs).
  - **Fix**: if ingestion was down, you can't recover past messages — Meta only delivers live. Make sure the webhook stays up going forward.
- **Signals feel off for a WhatsApp-heavy day**
  - **Check**: whether the export really captured the conversation (open the markdown file).
  - **Fix**: if messages are missing, fix ingestion first; if they're present but signals seem thin, see [Signal taxonomy](../concepts/signal-taxonomy.md) and confirm the extraction prompts aren't too restrictive.
- **Sensitive content appears in logs**
  - **Check**: your log level and any logging of webhook payloads.
  - **Fix**: reduce log verbosity, scrub bodies, and rotate any logs that already captured message content.
