# Audio → resilience analysis pipeline

Isolated from the news pipeline: **MP3 (or other audio) → OpenAI transcription (with speaker diarization) → `articles-audio.md` → extract-signals → assess-signals** (same 8-component scoring as news).

Sources are intentionally **generic** (broadcast, podcast, video rip, voice memo, interview). Add **adapters** under `business_modules/audio/infrastructure/adapters/` for URL fetch, platform-specific metadata, etc.

## Prerequisites

| Requirement | Purpose |
|-------------|---------|
| `OPENAI_API_KEY` | OpenAI Audio API (diarization uses `gpt-4o-transcribe-diarize`) |
| `ANTHROPIC_API_KEY` | Resilience signal extraction + narratives (unchanged) |
| `ffmpeg` / `ffprobe` (optional) | Only if a single file exceeds **~24 MB**; audio is split into temp segments before upload |

OpenAI transcription uploads are limited to **25 MB** per request.

## Stage 1 — Ingest audio to markdown

```bash
npm run audio-to-md -- --input /path/to/recording.mp3 --date 2026-03-21 --station "KAN" --program "Morning show"
```

Outputs **`articles-audio.md`** (default path). Flags:

| Flag | Meaning |
|------|---------|
| `--input` | Path to audio (`mp3`, `m4a`, `wav`, `webm`, etc.) |
| `--date` | Content date `YYYY-MM-DD` |
| `--station` | Source label (metadata — e.g. station, show, or channel) |
| `--program` | Segment / episode / program name |
| `--published` | Optional display string for “Published” (default: `--date`) |
| `--out` | Output markdown path (default: `articles-audio.md`) |
| `--whisper` | Use `whisper-1` only (**no** speaker diarization; cheaper / debug) |

**Default model:** `gpt-4o-transcribe-diarize` with `response_format: diarized_json` and `chunking_strategy: auto` (required for audio longer than ~30 seconds). This is the OpenAI Audio API path with **speaker labels**, not plain `whisper-1`.

Optional **known speaker** hints (future CLI): short reference clips can improve labeling when passed through `AudioIngestService` (`knownSpeakerNames` / `knownSpeakerReferences`).

## Stage 2 — Extract and assess transcripts

```bash
npm run extract-signals -- --source-type radio --files articles-audio.md --date 2026-03-21
npm run assess-signals -- --date 2026-03-21 --days 1 --scope national
```

- Uses **audio-transcript** prompts in `claudeEvaluator.js` (spoken text, speaker labels, selection bias).
- **Does not** dedupe by title (audio blocks often share a program prefix).

## Module layout

| Path | Role |
|------|------|
| `business_modules/audio/domain/ports/IAudioTranscriptionPort.js` | Port contract (JSDoc) |
| `business_modules/audio/infrastructure/adapters/openaiTranscriptionAdapter.js` | OpenAI Audio API (default adapter) |
| `business_modules/audio/app/audioIngestService.js` | Split large files, transcribe, chunk text → markdown |
| `business_modules/audio/input/audio-to-md.js` | CLI entry |
| `business_modules/resilience_scorer/input/extract-signals.js` | Stage 1: per-source signal extraction |
| `business_modules/resilience_scorer/input/assess-signals.js` | Stage 2: merge + score + narrate |

Reports include **Content kind** = `audio` in the markdown header table when applicable.
