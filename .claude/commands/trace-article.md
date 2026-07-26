---
allowed-tools: Bash(npm run trace-article:*), Read, Write
description: Trace extraction reasoning for a single attached article (cheap, no side effects)
---

## Your task

**Billing switch:** If the arguments include `--api`, strip that token and use the plain script names without the `:cli` suffix (e.g. `npm run pipeline:run` instead of `npm run pipeline:run:cli`, `npm run extract-signals` instead of `npm run extract-signals:cli`). `:cli` bills LLM calls to the Max subscription; `--api` forces metered API credits — use it when subscription limits must not interrupt the run.


Trace the closed-catalog signal extraction for the SINGLE article the user attached or pasted. Do NOT run assess or any full pipeline. Do NOT ask for confirmation — just go.

**Step 1 — Resolve the article input**
- If a file is attached, use its path directly.
- If the user pasted raw article text, write it verbatim to `logs/traces/_input-<timestamp>.txt` and use that path.

**Step 2 — Run the trace**
```
npm run trace-article:cli -- --file <path> --source-type news --date <today's date>
```
- Use today's date (YYYY-MM-DD) from the context above for `--date`.
- Use `--source-type radio` or `--source-type visits` only if the user says the article is a radio transcript or a visits/field report.
- Rationale (model reasoning) is ON by default; add `--no-rationale` only if the user asks for the cheapest A-only trace.

**Step 3 — Present the result**
Read the trace `.md` path printed at the end of the command output, then present:
- The per-article signals table: type, evidence quote, confidence, rationale, self-check verdict, and status (kept / dropped + stage).
- The rejected-candidates block (facts the model considered but did not emit).

**Step 4 — Summarize**
In 2-4 lines, summarize what was kept vs dropped and why, calling out any case where the extractor's rationale and the self-check verdict disagree (those are the most useful for tuning).
