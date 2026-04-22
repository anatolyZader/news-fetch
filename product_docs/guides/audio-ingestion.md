---
title: "Audio ingestion"
description: "Transcribe audio into markdown and run the same resilience analysis pipeline."
intent: guides
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/guides/audio-ingestion"
version: "current"
tags: ["guides", "audio", "ingestion", "user"]
---

## What this does
If you have a radio broadcast / interview / podcast clip that matters for today’s assessment, this guide turns it into text evidence (a markdown transcript) and then runs the same analysis pipeline used for news and WhatsApp.

## Transcribe audio → markdown

```bash runnable
npm run audio-to-md -- --input /path/to/recording.mp3 --date 2026-04-21 --station "KAN" --program "Morning show"
```

Expected: a markdown file is created/updated (default `articles-audio.md`) with the transcript.

## If speaker labels are wrong, force “plain” transcription

```bash runnable
npm run audio-to-md -- --input /path/to/recording.mp3 --date 2026-04-21 --whisper
```

Expected: a single transcript without speaker diarization.

## Analyze the transcript (add it to today’s assessment)

```bash runnable
npm run analyze-resilience -- --content-kind audio --files articles-audio.md --date 2026-04-21
```

Expected: signals are extracted and today’s report updates after refresh.

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
