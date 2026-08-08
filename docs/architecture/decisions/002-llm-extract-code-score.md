# ADR 002: LLM extracts, code scores

## Status

Accepted

## Decision

Signal extraction and narratives use LLMs; numeric component scores are computed deterministically in `behaviorSignals.js` / scoring pipeline code only.

## Consequences

- Developer tier may see raw scores; user tier uses redacted payloads.
