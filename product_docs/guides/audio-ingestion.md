---
title: "Audio ingestion"
description: "Transcribe audio into markdown and run the same resilience analysis pipeline."
intent: guides
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.srulik.ai/guides/audio-ingestion"
version: "current"
tags: ["guides", "audio", "ingestion", "user"]
---

## What this does
If you have a radio broadcast / interview / podcast clip that matters for today’s assessment, this guide turns it into text evidence (a markdown transcript) and then runs the same analysis pipeline used for news and WhatsApp.

## What you will see in the app
- Some evidence items will cite audio/radio coverage as a source (if enabled by your operator).
- Audio-derived evidence often shows up as direct quotes or summarized transcript fragments, depending on privacy settings.

## Troubleshooting
- **Transcription fails with “file too large”**
  - **Cause**: long recordings exceed the upload cap.
  - **Fix**: install `ffmpeg` so the script can split audio automatically.
- **Transcription fails (401)**
  - **Cause**: missing/invalid `OPENAI_API_KEY`.
  - **Fix**: set the key and retry.
- **Analysis fails**
  - **Cause**: missing `ANTHROPIC_API_KEY` (analysis) or upstream outage.
  - **Fix**: set the key and retry later if the provider is down.
