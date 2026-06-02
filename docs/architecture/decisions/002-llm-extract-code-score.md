# ADR 002: LLM extracts, code scores

## Status

Accepted

## Decision

Signal extraction and narratives use LLMs; numeric component scores are computed deterministically in `behaviorSignals.js` / scoring pipeline code only.

## Consequences

- Prompt and catalog changes require golden eval (`npm run golden:eval`) in CI.
- Analyst tier may see raw scores; operator tier uses redacted payloads.
