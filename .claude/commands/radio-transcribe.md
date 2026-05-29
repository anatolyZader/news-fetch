---
allowed-tools: Bash(node business_modules/audio/input/audio-to-md.js*), Bash(find business_modules/recording/data/*), Bash(ls business_modules/recording/data/* articles-audio-*), Bash(node business_modules/recording/input/manage-jobs.js list)
description: Transcribe all radio recordings from today that haven't been transcribed yet
---

## Your task

Transcribe all of today's radio recordings into markdown files. Do NOT ask for confirmation — just go.

Today's date is the date from context above.

---

**Step 1 — Find today's recordings**

```
find business_modules/recording/data/*/$(date +%Y-%m-%d) -name "recording.mp3" 2>/dev/null
```

Use today's date from context (not shell `date`). Each result follows the pattern:
`business_modules/recording/data/{station}/{date}/{program-slug}/{uuid}/recording.mp3`

**Step 2 — Check which are already transcribed**

For each recording found, derive its expected output filename:
- Station = the directory name directly under `business_modules/recording/data/` (e.g. `ashams`, `kan-reka`, `tzafon-1045`)
- Time slot = extract the start time from the program slug (the HH-MM part, e.g. `משדרי-הבוקר-אשמס-09-00-11-00` → `09-00`)
- Expected output: `articles-audio-{station}-{date}T{HH-MM}.md`

Check if that file already exists. If it does, skip this recording.

**Step 3 — Get program names from recording jobs**

```
node business_modules/recording/input/manage-jobs.js list
```

Match each recording's station + program slug to the job list to get the proper program name and language. The program slug in the directory is a slugified version of the program name from the job.

**Step 4 — Transcribe each recording**

For each un-transcribed recording, run:
```
node business_modules/audio/input/audio-to-md.js \
  --input <path-to-recording.mp3> \
  --date <today's date> \
  --station <station> \
  --program "<program name from job>" \
  --out <expected-output-path> \
  --contextualize
```

If the station language (from job list) is not Hebrew, add `--whisper`.

Run recordings **sequentially** (each transcription is resource-intensive).

**Step 5 — Report results**

After all transcriptions complete, report:
- How many recordings were found
- How many were already transcribed (skipped)
- How many were newly transcribed
- List the output files created
