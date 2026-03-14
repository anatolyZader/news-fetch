# Ynet articles API

Minimal Fastify app that returns a full list of articles from **ynet.co.il** in **Hebrew** for a given day, using [NewsAPI.ai](https://newsapi.ai).

Spec: [docs/specs/ynet-articles-api.md](docs/specs/ynet-articles-api.md).

## Setup

```bash
npm install
```

Set your API key (get one at [newsapi.ai](https://newsapi.ai)). Either put it in a `.env` file (loaded automatically) or export it:

```bash
# .env
NEWSAPI_API_KEY=your-key
```

```bash
# or
export NEWSAPI_API_KEY=your-key
```

## Run

```bash
npm start
```

Server listens on `http://0.0.0.0:3000` (override with `HOST` / `PORT`).

## API

- **GET /articles** — Returns JSON array of articles for today (server date in `Asia/Jerusalem`).
- **GET /articles?date=YYYY-MM-DD** — Returns articles for that day. Date must be valid and not in the future.

Each article has at least: `title`, `url`, `publishedAt` (ISO 8601), `source`.

## Test

```bash
npm test
```

Unit tests mock the NewsAPI.ai client. The integration test (`articles.integration.test.js`) calls the real API and requires `NEWSAPI_API_KEY` (e.g. in `.env`); it is skipped when the key is not set.

## Config

| Env | Description |
|-----|-------------|
| `NEWSAPI_API_KEY` | Required. NewsAPI.ai API key (e.g. in `.env`). |
| `TZ_ARTICLES` | Timezone for “today” and date window (default: `Asia/Jerusalem`). |
| `HOST` / `PORT` | Listen address (default: `0.0.0.0:3000`). |
