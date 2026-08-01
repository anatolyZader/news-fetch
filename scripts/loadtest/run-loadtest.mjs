/**
 * Load-test runner: drives the hot endpoints with autocannon and reads
 * latency/loop-lag/heap off /api/monitoring/summary before and after each
 * scenario. Results are printed and saved under scripts/loadtest/baselines/.
 *
 * Usage:
 *   1. Start the server for testing (separate shell):
 *        AUTH_REQUIRED=false CHAT_LLM_STUB=true PORT=3100 node server.js
 *   2. LOADTEST_BASE_URL=http://127.0.0.1:3100 npm run loadtest
 *
 * Env:
 *   LOADTEST_BASE_URL     default http://127.0.0.1:3000
 *   LOADTEST_BEARER       optional Authorization bearer token
 *   LOADTEST_DURATION_S   default 10
 *   LOADTEST_CONNECTIONS  default 20 (chat scenario capped at 10)
 *   LOADTEST_SCENARIOS    csv filter, e.g. "report-today,chat"
 *   LOADTEST_LABEL        label stored in the results file (default: timestamp)
 */

import autocannon from 'autocannon';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.LOADTEST_BASE_URL || 'http://127.0.0.1:3000';
const BEARER = process.env.LOADTEST_BEARER || '';
const DURATION_S = Number.parseInt(process.env.LOADTEST_DURATION_S ?? '10', 10) || 10;
const CONNECTIONS = Number.parseInt(process.env.LOADTEST_CONNECTIONS ?? '20', 10) || 20;
const SCENARIO_FILTER = (process.env.LOADTEST_SCENARIOS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

const headers = {
  ...(BEARER ? { authorization: `Bearer ${BEARER}` } : {}),
};

const SCENARIOS = [
  {
    name: 'report-today',
    method: 'GET',
    path: '/api/report/today',
    connections: CONNECTIONS,
  },
  {
    name: 'report-dates',
    method: 'GET',
    path: '/api/report/dates',
    connections: CONNECTIONS,
  },
  {
    name: 'municipalities',
    method: 'GET',
    path: '/api/municipalities',
    connections: CONNECTIONS,
  },
  {
    // SSE turn; requires the server to run with CHAT_LLM_STUB=true so no LLM
    // spend occurs. The 15/min per-uid chat rate limit means 429s are expected
    // at sustained load — the status histogram below makes that visible.
    name: 'chat',
    method: 'POST',
    path: '/api/chat',
    connections: Math.min(CONNECTIONS, 10),
    body: JSON.stringify({ message: 'loadtest ping', lang: 'en' }),
    headers: { 'content-type': 'application/json' },
    setup: async () => {
      const res = await fetch(`${BASE_URL}/api/chat/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`chat session create failed: ${res.status}`);
      const { id } = await res.json();
      return { body: JSON.stringify({ sessionId: id, message: 'loadtest ping', lang: 'en' }) };
    },
  },
];

async function fetchMonitoringSummary() {
  try {
    const res = await fetch(`${BASE_URL}/api/monitoring/summary`, { headers });
    if (!res.ok) return { unavailable: true, status: res.status };
    const data = await res.json();
    const latency = data.latency ?? {};
    const pick = (needle) => Object.fromEntries(
      Object.entries(latency).filter(([k]) => k.includes(needle)),
    );
    return {
      http_latency: pick('http.request.duration_ms'),
      chat_turn: pick('chat.turn.duration_ms'),
      loop_delay_p99: latency['runtime.event_loop_delay.p99_ms']?.gauge ?? null,
      heap_used: latency['runtime.heap_used_bytes']?.gauge ?? null,
      health: data.health?.status ?? null,
    };
  } catch (err) {
    return { unavailable: true, error: err?.message };
  }
}

function summarizeRun(result) {
  return {
    requests_per_sec: result.requests.average,
    latency_ms: {
      p50: result.latency.p50,
      p97_5: result.latency.p97_5,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    status: {
      '2xx': result['2xx'],
      non2xx: result.non2xx,
    },
    errors: result.errors,
    timeouts: result.timeouts,
  };
}

async function runScenario(scenario) {
  let extra = {};
  if (scenario.setup) {
    try {
      extra = await scenario.setup();
    } catch (err) {
      console.warn(`  [skip] ${scenario.name}: setup failed — ${err.message}`);
      return { skipped: true, reason: err.message };
    }
  }

  const before = await fetchMonitoringSummary();
  const result = await autocannon({
    url: `${BASE_URL}${scenario.path}`,
    method: scenario.method,
    duration: DURATION_S,
    connections: scenario.connections,
    headers: { ...headers, ...(scenario.headers ?? {}) },
    ...(scenario.body ? { body: scenario.body } : {}),
    ...extra,
  });
  const after = await fetchMonitoringSummary();

  const summary = summarizeRun(result);
  console.log(`  req/s avg: ${summary.requests_per_sec}`);
  console.log(`  latency ms p50/p97.5/p99/max: ${summary.latency_ms.p50}/${summary.latency_ms.p97_5}/${summary.latency_ms.p99}/${summary.latency_ms.max}`);
  console.log(`  2xx: ${summary.status['2xx']}  non-2xx: ${summary.status.non2xx}  errors: ${summary.errors}  timeouts: ${summary.timeouts}`);
  if (after.loop_delay_p99 != null) {
    console.log(`  server loop-lag p99 after: ${Math.round(after.loop_delay_p99)}ms  heap: ${Math.round((after.heap_used ?? 0) / 1e6)}MB  health: ${after.health}`);
  }
  return { summary, monitoring: { before, after } };
}

async function main() {
  const scenarios = SCENARIO_FILTER.length
    ? SCENARIOS.filter((s) => SCENARIO_FILTER.includes(s.name))
    : SCENARIOS;
  if (!scenarios.length) {
    console.error(`No scenarios match filter "${SCENARIO_FILTER.join(',')}"`);
    process.exit(1);
  }

  console.log(`Load test against ${BASE_URL} — ${DURATION_S}s × ${CONNECTIONS} connections\n`);

  const results = {
    label: process.env.LOADTEST_LABEL || new Date().toISOString(),
    base_url: BASE_URL,
    duration_s: DURATION_S,
    connections: CONNECTIONS,
    scenarios: {},
  };

  for (const scenario of scenarios) {
    console.log(`▶ ${scenario.name} (${scenario.method} ${scenario.path})`);
    results.scenarios[scenario.name] = await runScenario(scenario);
    console.log('');
  }

  const outDir = join(dirname(fileURLToPath(import.meta.url)), 'baselines');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = resolve(outDir, `loadtest-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`Results written to ${outPath}`);
}

main().catch((err) => {
  console.error('loadtest failed:', err);
  process.exit(1);
});
