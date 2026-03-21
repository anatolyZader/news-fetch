# Radio → resilience analysis pipeline

Isolated from the news pipeline: **audio file → OpenAI transcription (with speaker diarization) → `articles-radio.md` → same 8-component resilience analysis** as news.

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| `OPENAI_API_KEY` | OpenAI Audio API (diarization uses `gpt-4o-transcribe-diarize`) |
| `ANTHROPIC_API_KEY` | Resilience signal extraction + narratives (unchanged) |
| `ffmpeg` / `ffprobe` (optional) | Only if a single file exceeds **~24 MB**; audio is split into temp segments before upload |

OpenAI transcription uploads are limited to **25 MB** per request.

## Stage 1 — Ingest audio to markdown

```bash
npm run radio-audio-to-md -- --input /path/to/broadcast.mp3 --date 2026-03-21 --station "KAN" --program "Morning show"
```

Outputs **`articles-radio.md`** (default path). Flags:

| Flag | Meaning |
|------|---------|
| `--input` | Path to audio (`mp3`, `m4a`, `wav`, `webm`, etc.) |
| `--date` | Broadcast date `YYYY-MM-DD` |
| `--station` | Station label (metadata) |
| `--program` | Program name |
| `--published` | Optional display string for “Published” (default: `--date`) |
| `--out` | Output markdown path (default: `articles-radio.md`) |
| `--whisper` | Use `whisper-1` only (**no** speaker diarization; cheaper / debug) |

**Default model:** `gpt-4o-transcribe-diarize` with `response_format: diarized_json` and `chunking_strategy: auto` (required for audio longer than ~30 seconds). This is the OpenAI Audio API path with **speaker labels**, not plain `whisper-1`.

Optional **known speaker** hints (future CLI): short reference clips can improve labeling when passed through `RadioIngestService` (`knownSpeakerNames` / `knownSpeakerReferences`).

## Stage 2 — Analyze transcripts

```bash
npm run analyze-radio
```

Equivalent to:

```bash
npm run analyze-resilience -- --content-kind radio --files articles-radio.md
```

- Uses **radio-specific** prompts in `claudeEvaluator.js` (transcripts, speaker labels, broadcast bias).
- **Does not** dedupe by title (radio blocks often share a program prefix).

## Module layout

| Path | Role |
|------|------|
| `business_modules/radio/domain/ports/IRadioTranscriptionPort.js` | Port contract (JSDoc) |
| `business_modules/radio/infrastructure/adapters/openaiTranscriptionAdapter.js` | OpenAI Audio API |
| `business_modules/radio/app/radioIngestService.js` | Split large files, transcribe, chunk text → markdown |
| `scripts/radio-audio-to-md.js` | CLI entry |
| `src/resilience/runResilienceAnalysis.js` | Shared runner for news + radio |

Reports include **Content kind** = `radio` in the markdown header table when applicable.
