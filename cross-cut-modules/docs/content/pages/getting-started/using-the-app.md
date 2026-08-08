---
title: "Using the app (first report)"
description: "User-first: generate your first daily assessment in the UI."
intent: getting-started
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/getting-started/using-the-app"
version: "current"
tags: ["getting-started", "user"]
---

## Who this is for
This page is for people who want to **use** Srulik's lab in the browser: read today's assessment, understand what moved the score, and contribute evidence—without touching code.

## Getting into the app
1. Open the srulik.ai link your organization uses.
2. If you see a sign-in prompt, sign in with the Google account your user approved.

You should land on the **Report** tab.

## Reading today's assessment
The report supports **decision support**, not automated verdicts. Use two passes:

1) **Fast scan (1–2 minutes)**
- Read the **page subtitle** and **epistemic banner** (how much to trust today's synthesis).
- Check **evidence overview** (adequate vs thin components).
- Scan **What needs attention**.

2) **Proof mode (5 minutes)**
- For any surprising item, open **evidence** under that component.
- Ask: "What changed in the evidence compared to yesterday?"

If you can point to evidence behind a concern, the system is behaving correctly. See [User workflow](../guides/user-workflow.md) and [Decision support model](../concepts/decision-support-model.md).

## Asking follow-up questions (chat)
After the report loads, you can ask questions like:
- "Why did community cohesion drop?"
- "Which municipalities reported disruptions today?"
- "What evidence supports the highest risk component?"

Good questions are specific. Srulik's lab should answer using evidence already present (and say "I don't know" when it can't support a claim).

## Submitting your own evidence
At the top of the page there's an evidence submission bar.

- Paste a link, a quote, or a short observation.
- Click **Submit**.
- Confirm it appears in the **Submissions** tab.

Your submission should be incorporated on the next assessment run.

## Where the evidence comes from
The **Daily assessment** report is built from many input feeds — news, WhatsApp, audio, PBO reports, field visits, social media, pools (Naftali, Education), Trends, and your submissions. Open **Data sources** in the header to audit those inputs (not the report). See [Srulik's lab docs](../index.md) for a short guide to each feed.

## Other areas in the app
- **Daily assessment** (header): today’s synthesized report — start here every morning
- **Data sources** (header): PBO reports, Report bot, Visits, News, Social media, Pools, Trends — audit what fed the run
- **Send data** (top bar): your manual submissions for the next run
- **Chat** (bottom-right): follow-up questions grounded in today’s report

## Troubleshooting
- **I see "No assessment is available yet"**
  - **What it usually means**: today's ingestion/analysis didn't run.
  - **What to do**: ask your user to run the daily pipeline for today (see [Operate the daily pipeline](https://docs.vibeswitch.ai/guides/operating-daily-pipeline)).
- **The report date is old (yellow banner)**
  - **What it usually means**: you're looking at the last successful cached run.
  - **What to do**: have today's pipeline run, then refresh.
- **I'm stuck in a sign-in loop / "Unauthorized"**
  - **What it usually means**: your account isn't authorized for this instance.
  - **What to do**: ask your user to authorize your account or verify auth config (see [Auth setup](https://docs.vibeswitch.ai/getting-started/auth-setup)).
- **A score looks wrong**
  - **What it usually means**: evidence changed (or is too thin).
  - **What to do**: open the evidence items under that component; if evidence is thin, add/ingest more. If evidence is strong but scoring seems off, flag it to the user and include the evidence links.
