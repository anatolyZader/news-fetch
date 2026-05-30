---
title: "Troubleshooting"
description: "Find full technical docs, pages missing from the in-app panel, and where to go next."
intent: troubleshooting
audience: ["public", "customer"]
stability: beta
canonical: "https://docs.vibeswitch.ai/troubleshooting/in-app-and-full-docs"
version: "current"
tags: ["troubleshooting", "user"]
---

## I need architecture, API, or deploy docs
The in-app docs panel covers everyday use — not install, deploy, or API reference.

**Fix** — use **Open full docs** in the app, or go to [docs.srulik.ai](https://docs.vibeswitch.ai/).

## I can't find a page in the in-app docs panel
**Check** — the in-app panel only lists everyday user guides.

**Fix** — search within the panel, or open [full docs](https://docs.vibeswitch.ai/) for the complete library.

**Semantic search (suggested topics)** — requires the `docs` RAG index. Operators run `npm run rag:reindex-docs` after product docs change (typically post-`docs:sync` on deploy). When `DOCS_RAG_ENABLED=0`, the panel falls back to title/tag filtering only.

## Something is broken in the product
For operator-level recovery (auth, pipeline, ingestion), see [Common failures](../operations/common-failures.md) on full docs, or ask your deployment operator.

## Troubleshooting
- **Open full docs does nothing** — your browser may block pop-ups; allow them for this site or copy the link from the footer.
- **Still stuck** — contact your operator with the page you expected and what you see instead.
