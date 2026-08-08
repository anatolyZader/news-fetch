# Project Summary — Product Engineer framing (for CV / ChatGPT)

Paste this into ChatGPT and ask it to turn it into **Product Engineer** CV bullet points tailored to a target company.

## What a Product Engineer angle emphasizes

Owning outcomes end-to-end (not just tickets): shaping the problem, building full-stack, shipping to real users, measuring, and iterating. The bullets below are framed around user value, ownership, and shipping — with the technical depth to back it up.

## One-liner

Product engineer who built a homefront decision-support product end-to-end — from ingesting messy multi-source, multi-language data to shipping an LLM-powered assessment experience that real users use to make high-stakes calls (with the product deliberately designed so humans decide, not the model).

## The product

- A decision-support tool for civilian homefront / community resilience: turns noisy real-world inputs into **evidence-backed claims** users can trust and act on.
- Core product principle I designed around: **the system supports, humans decide** — "abstention" (I don't have enough evidence) is a first-class outcome, not a false "all clear." This shaped UX, scoring, and trust.
- Shipped and running in production; I own it across frontend, backend, AI, and infra.

## What I owned end-to-end

- **Problem → product:** translated a fuzzy real-world need (assessing community resilience from scattered sources) into a concrete daily workflow and UI users actually use.
- **Full-stack delivery:** React SPA frontend + Node.js/Fastify API backend, wired through a clean modular architecture; API contract defined in OpenAPI.
- **AI as a product feature (not a demo):** built an LLM assessment agent + RAG (Anthropic/OpenAI/Cohere + vector search) that produces cited, evidence-linked outputs — with guardrails, cost budgets, and quality evals so it's dependable, not just impressive.
- **Ingestion that meets reality:** pipelines for news, radio/audio, video/YouTube, WhatsApp, Telegram/social, surveys, and field reports — normalized into one signal format so the product isn't blocked by source chaos.
- **Iteration loop:** golden-corpus evaluation, tuning tooling, and validation phases to measure extraction/assessment quality and improve it release over release.
- **Ship & operate:** production deploy (PM2 on Linux), OpenTelemetry tracing, CI security/supply-chain gates, Playwright e2e — so shipping fast didn't mean shipping fragile.
- **Reach:** Telegram report bot and email digests to deliver value where users already are; Hebrew/English i18n for the actual audience.

## Product-engineer strengths this project shows

- Comfortable owning the whole slice: UX decisions, API design, model behavior, and prod ops.
- Bias to ship: 100+ operational scripts and a daily automated pipeline turning the product from prototype into a running system.
- Judgment about AI trust & UX: designed for evidence, citations, and abstention instead of confident-but-wrong answers.
- Cost- and quality-aware: token budgeting and eval harnesses so the product scales without runaway spend or silent regressions.
- Architecture that keeps velocity: modular monolith with CI-enforced boundaries (25+ domain modules) so features stay fast to add.

## Tech stack

- **Frontend:** React (Vite)
- **Backend:** Node.js, Fastify, ES modules (Node 22+)
- **AI/ML:** Anthropic, OpenAI, Cohere; RAG with a vector index
- **Data / infra:** Firebase Admin, Google APIs, OpenTelemetry, PM2
- **Quality & delivery:** OpenAPI/Redocly, Playwright, ESLint (SonarJS), SonarQube, dependency-cruiser, golden-corpus evals
- **Practices:** end-to-end ownership, evidence-first product design, CI security/supply-chain gates, i18n
