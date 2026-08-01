# Load testing

Measures the hot endpoints under concurrency and reads server-side latency,
event-loop lag, and heap off `/api/monitoring/summary`. Zero LLM spend: the
chat scenario requires the server to run with the stub adapter.

## Running

Start a test server (separate shell — do NOT run against the PM2 prod process):

```bash
AUTH_REQUIRED=false CHAT_LLM_STUB=true PORT=3100 node server.js
```

Then:

```bash
LOADTEST_BASE_URL=http://127.0.0.1:3100 npm run loadtest
```

Results print to the console and are saved as JSON under
`scripts/loadtest/baselines/`.

## Knobs

| Env | Default | Meaning |
|---|---|---|
| `LOADTEST_BASE_URL` | `http://127.0.0.1:3000` | target server |
| `LOADTEST_BEARER` | – | bearer token when testing with auth on |
| `LOADTEST_DURATION_S` | `10` | seconds per scenario |
| `LOADTEST_CONNECTIONS` | `20` | concurrent connections (chat capped at 10) |
| `LOADTEST_SCENARIOS` | all | csv filter: `report-today,report-dates,municipalities,chat` |
| `LOADTEST_LABEL` | timestamp | label stored in the results JSON |

## Scenarios

- `report-today` — `GET /api/report/today` (main read path)
- `report-dates` — `GET /api/report/dates` (directory-scan path)
- `municipalities` — `GET /api/municipalities` (XLSX parse path). Requires a
  `LOADTEST_BEARER` token of a registered district operator; without it the
  scenario measures only the fast 403 auth-rejection path.
- `chat` — `POST /api/chat` SSE turn against the stub adapter. The 15/min
  per-user chat rate limit means 429s are expected at sustained load; the
  status counts in the output make that visible.

## Baseline / comparison procedure

1. Capture a baseline **before** a performance change lands:
   `LOADTEST_LABEL=baseline-pre-stage1 npm run loadtest`
2. Apply the change, restart the test server with identical env.
3. Re-run with the same duration/connections:
   `LOADTEST_LABEL=post-stage1 npm run loadtest`
4. Compare the two JSON files in `baselines/`: `latency_ms` percentiles per
   scenario, plus `monitoring.after.loop_delay_p99` and `heap_used`.

Notes:

- Chat is SSE; autocannon reports time-to-full-response (the stub answers in
  ~600 ms, so the number is meaningful).
- Prefer a copy of production data dirs (reports, signals) so payload sizes are
  realistic; the numbers are only comparable when the data set is identical.
