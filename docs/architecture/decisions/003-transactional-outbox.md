# ADR 003: Transactional outbox for domain events

## Status

Accepted

## Decision

Domain events are written to `outbox_events` in SQLite when a store is available; `scripts/workers/outbox-dispatch.js` drains to the in-process bus. Handlers are idempotent via `processed_events`.

## Consequences

- CLI paths may publish directly to the bus when no outbox is injected.
- Side effects (RAG index, drift) subscribe on the bus at composition root.
