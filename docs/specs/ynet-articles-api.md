# Spec: Simple Fastify app – Ynet.co.il articles (same day, Hebrew) via NewsAPI.ai

## Summary

A minimal Fastify HTTP app that returns a **full list of articles/reports** published on **ynet.co.il** in **Hebrew** for **the same calendar day** (today, or a given date), using **NewsAPI.ai** (https://newsapi.ai) as the data source.

**Note:** “newspi.ai” in the request is interpreted as **NewsAPI.ai** (newsapi.ai).

---

## Goals

1. Expose an HTTP API that returns all articles from ynet.co.il in Hebrew for a single day.
2. Use NewsAPI.ai as the sole external source for article list data.
3. Keep the app simple: one main route, minimal dependencies, easy to run and test.

---

## Out of scope

- Authentication/authorization
- Caching (can be added later)
- Persistence (DB)
- Frontend or SSR
- Webhooks or real-time push

---

## API contract

### Data source

- **Provider:** NewsAPI.ai  
- **Relevant endpoint:** Articles API (query articles from publishers; 60+ languages, 150k+ sources).  
- **Filters used:**
  - **Source:** ynet.co.il (e.g. `sourceUri` or equivalent domain/source filter per NewsAPI.ai docs).
  - **Language:** Hebrew — use the language code accepted by the API (e.g. ISO 639-2 `heb` or API-specific code; confirm in NewsAPI.ai docs).
  - **Date:** Same day only — articles whose publication date falls within the requested calendar day (start of day 00:00:00 to end of day 23:59:59 in a well-defined timezone, e.g. Israel or UTC).

### App endpoint

- **Method:** `GET`
- **Path:** `/articles` (or `/api/articles` if you prefer a prefix)
- **Query parameters (suggested):**
  - `date` (optional): Date in `YYYY-MM-DD`. Default: **today** (server date, timezone configurable; recommend Israel for ynet).
- **Success response:** `200 OK`
  - **Body:** JSON array of article items. Each item must include at least:
    - **Title** (string)
    - **URL** (string)
    - **Published date/time** (ISO 8601 string)
    - **Source** (e.g. "ynet.co.il" or as returned by NewsAPI.ai)
  - Additional fields (description, image, author, etc.) may be passed through from NewsAPI.ai if useful.
- **Error responses:**
  - `502 Bad Gateway` (or `503`) when NewsAPI.ai is unreachable or returns an error.
  - `400 Bad Request` if `date` is invalid (e.g. wrong format or future date if you disallow it).
  - Optional: `429 Too Many Requests` if you implement rate limiting or proxy NewsAPI.ai quota errors.

### Pagination

- NewsAPI.ai typically supports `pageSize` and `page`. The app must **aggregate all pages** for the given day so that the response is a **full list** for that day (no pagination on our side in v1, unless the spec is later extended).
- If the total count is very large, consider a sensible max (e.g. cap at N pages or M articles) and document it.

---

## Technical constraints

- **Runtime:** Node.js
- **Framework:** Fastify
- **Config:** API key for NewsAPI.ai must not be hardcoded (use env var, e.g. `NEWSAPI_AI_KEY` or `NEWSAPI_AI_API_KEY`).
- **Timezone:** Same-day window for ynet should use a defined timezone (e.g. `Asia/Jerusalem`). Document the choice in README or config.

---

## Inputs and outputs (summary)

| Input              | Type   | Required | Description                                      |
|--------------------|--------|----------|--------------------------------------------------|
| `date`             | string | No       | `YYYY-MM-DD`; default = today (server date)      |

| Output (success)   | Type   | Description                                      |
|--------------------|--------|--------------------------------------------------|
| HTTP status        | number | 200                                              |
| Body               | array  | List of article objects (title, url, date, source, …) |

| Output (error)     | Type   | Description                                      |
|--------------------|--------|--------------------------------------------------|
| 400                | -      | Invalid `date` format or invalid value           |
| 502/503            | -      | NewsAPI.ai unavailable or error                  |

---

## Edge cases

1. **Empty day:** No articles for the given day → return `200` with `[]`.
2. **Invalid date:** Malformed or unsupported `date` → `400` with a clear message.
3. **Future date:** Optional rule: reject with `400` if `date` is after today.
4. **Missing API key:** Server should fail fast at startup or return `503` with a clear message when the key is missing.
5. **NewsAPI.ai rate limit / quota:** Map to `429` or `503` and document.

---

## Acceptance criteria

- [ ] `GET /articles` (or `/api/articles`) returns JSON array of articles.
- [ ] Articles are from **ynet.co.il** only.
- [ ] Articles are in **Hebrew** only (per NewsAPI.ai language filter).
- [ ] Articles are from the **requested day** (or today if `date` omitted), in the chosen timezone.
- [ ] Each item includes at least: title, url, published date, source.
- [ ] Full list for the day is returned (all pages from NewsAPI.ai aggregated).
- [ ] API key is read from environment; app does not start or clearly errors if key is missing.
- [ ] Invalid `date` returns 400; upstream failure returns 502/503.

---

## References

- NewsAPI.ai: https://newsapi.ai  
- NewsAPI.ai documentation: https://newsapi.ai/documentation (and API reference for articles endpoint, source/language/date parameters).
- Source filter (e.g. `sourceUri`): ynet.co.il.
- Language: Hebrew (e.g. ISO 639-2 `heb` — confirm in NewsAPI.ai docs).
- Timezone: e.g. `Asia/Jerusalem` for “same day” for ynet.
