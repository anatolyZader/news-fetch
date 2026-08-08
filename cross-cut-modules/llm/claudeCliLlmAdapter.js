/**
 * Claude Code CLI adapter implementing the LLM transport port (see ./ILlmPort.js).
 *
 * Routes single-shot calls (`createMessage`, `stream`) through a spawned
 * `claude -p` process so inference bills to the user's Max subscription
 * instead of metered API credits. `runToolLoop` (caller-defined JS tools)
 * cannot run inside `claude -p` and delegates to the Anthropic SDK adapter,
 * which still requires ANTHROPIC_API_KEY.
 *
 * Subscription-limit policy (LLM_CLI_LIMIT_STRATEGY):
 *  - 'ask'  (default): on a TTY, prompt the user — [w]ait for the limit
 *    to reset (default, stays $0) or [a] switch to metered API credits.
 *    Off-TTY it degrades to 'wait'. The choice is remembered for the process.
 *  - 'wait': sleep until the CLI-reported reset time (or poll every
 *    LLM_CLI_LIMIT_POLL_MS), then continue on subscription. Total waiting is
 *    capped by LLM_CLI_WAIT_MAX_MS. During an interactive wait, pressing "a"
 *    switches to API credits immediately.
 *  - 'api':  sticky switch to API credits on the first limit error.
 *  - 'fail': surface the error to the caller.
 * LLM_CLI_FALLBACK=0 forbids API credits entirely (forces waiting).
 *
 * Selected via LLM_TRANSPORT=claude-cli in getDefaultLlmPort(). Intended for
 * pipeline CLI runs launched from an interactive Claude Code session (the
 * spawned CLI inherits the subscription login); never set it in the server
 * environment — SSE chat depends on real delta streaming.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { createAnthropicLlmPort } from './anthropicLlmAdapter.js';

const STRIPPED_ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'];

const ASK_TIMEOUT_MS = 60_000;
const WAIT_SLICE_MS = 300_000; // heartbeat interval while waiting
const MIN_WAIT_MS = 1_000;     // floor so a stale reset timestamp can't spin-loop

function envInt(name, fallback) {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function cliTimeoutMs() { return envInt('LLM_CLI_TIMEOUT_MS', 900_000); }
function cliMaxConcurrency() { return envInt('LLM_CLI_MAX_CONCURRENCY', 2); }
function limitPollMs() { return envInt('LLM_CLI_LIMIT_POLL_MS', 600_000); }
function limitWaitMaxMs() { return envInt('LLM_CLI_WAIT_MAX_MS', 6 * 3_600_000); }
function limitResetBufferMs() { return envInt('LLM_CLI_RESET_BUFFER_MS', 60_000); }

/** API credits may be used on subscription limits — off when LLM_CLI_FALLBACK=0. */
function apiOnLimitAllowed() {
  const v = process.env.LLM_CLI_FALLBACK?.trim().toLowerCase();
  return v !== '0' && v !== 'false';
}

/** See the header comment for the four strategies. */
function limitStrategy() {
  const v = process.env.LLM_CLI_LIMIT_STRATEGY?.trim().toLowerCase();
  return ['ask', 'wait', 'api', 'fail'].includes(v) ? v : 'ask';
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stderr.isTTY);
}

/** Errors that mean the Max subscription quota is exhausted (not a transient blip). */
export function isSubscriptionLimitError(err) {
  const msg = String(err?.message ?? '');
  return /usage limit|limit reached|weekly limit|5-hour|rate.?limit|too many requests|\b429\b|quota/i.test(msg);
}

/** Pull the reset epoch out of CLI limit errors ("…usage limit reached|1753567200"). */
export function parseLimitResetEpochMs(text) {
  const m = /\|\s*(\d{10,13})\b/.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[1]);
  return m[1].length >= 13 ? n : n * 1000;
}

/** Join text blocks; reject content the CLI transport cannot carry (images, tool blocks). */
function blocksToText(content, where) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === 'string') return b;
        if (b?.type === 'text' && typeof b.text === 'string') return b.text;
        throw new Error(`claude-cli transport: unsupported ${where} block type "${b?.type}"`);
      })
      .join('\n');
  }
  throw new Error(`claude-cli transport: unsupported ${where} content shape`);
}

/** Normalize the repo's three system shapes (string | block array | {stable, dynamic}) to one string. */
export function normalizeSystemText(system) {
  if (system == null || system === '') return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) return blocksToText(system, 'system');
  if (typeof system === 'object' && system.stable != null) {
    const dynamic = system.dynamic ?? '';
    return dynamic ? `${String(system.stable)}\n\n${String(dynamic)}` : String(system.stable);
  }
  throw new Error('claude-cli transport: unsupported system prompt shape');
}

/** Flatten messages to a single prompt string (single user turn passes through verbatim). */
export function normalizeMessagesToPrompt(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('claude-cli transport: messages must be a non-empty array');
  }
  if (messages.length === 1 && messages[0].role === 'user') {
    return blocksToText(messages[0].content, 'message');
  }
  return messages
    .map((m) => `[${m.role}]\n${blocksToText(m.content, 'message')}`)
    .join('\n\n');
}

function tail(text, n = 400) {
  const s = String(text ?? '').trim();
  return s.length > n ? s.slice(-n) : s;
}

/**
 * Best error text for a failed CLI run. The CLI writes most errors — including
 * "usage limit reached|<epoch>" — to STDOUT (often as a JSON result envelope),
 * so stderr alone is frequently empty.
 */
function cliFailureText(stdout, stderr) {
  const errOut = tail(stderr);
  if (errOut) return errOut;
  try {
    const json = JSON.parse(stdout);
    return tail(json?.result ?? json?.error?.message ?? stdout);
  } catch {
    return tail(stdout);
  }
}

function fmtClock(epochMs) {
  return new Date(epochMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms) {
  const m = Math.round(ms / 60_000);
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/** Read one keypress from a raw TTY; resolves null on timeout. Ctrl+C still interrupts. */
function readKeypress(timeoutMs) {
  return new Promise((resolvePromise) => {
    const { stdin } = process;
    if (!stdin.isTTY) { resolvePromise(null); return; }
    let settled = false;
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(ch) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      resolvePromise(ch);
    }
    function onData(buf) {
      const ch = buf.toString('utf8');
      if (ch === '\u0003') { finish(null); process.kill(process.pid, 'SIGINT'); return; }
      finish(ch.toLowerCase());
    }
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/** Terminal prompt: wait for reset (default after 60s) or switch to API credits. */
async function promptLimitChoice(resetEpochMs) {
  const resetNote = resetEpochMs
    ? `resets ~${fmtClock(resetEpochMs)} (in ${fmtDuration(resetEpochMs - Date.now())})`
    : 'reset time unknown';
  console.error(`\n⏸ Max subscription limit reached — ${resetNote}.`);
  console.error('  [w] wait for the reset and continue on subscription (default)');
  console.error('  [a] continue now on metered API credits');
  console.error(`  choice? (auto-wait in ${ASK_TIMEOUT_MS / 1000}s)`);
  const key = await readKeypress(ASK_TIMEOUT_MS);
  return key === 'a' ? 'api' : 'wait';
}

/** Sleep until deadline; on an interactive wait, an "a" keypress aborts with 'api'. */
async function waitUntil(deadlineMs, apiAllowed) {
  for (;;) {
    const remaining = deadlineMs - Date.now();
    if (remaining <= 0) return 'reset';
    const slice = Math.min(remaining, WAIT_SLICE_MS);
    if (apiAllowed && isInteractive()) {
      const key = await readKeypress(slice);
      if (key === 'a') return 'api';
    } else {
      await sleep(slice);
    }
    const left = deadlineMs - Date.now();
    if (left > 0) {
      console.error(`  … still waiting for subscription reset (~${fmtDuration(left)} left)`);
    }
  }
}

/** Map a successful `claude -p --output-format json` result to an Anthropic-shaped message. */
function mapCliResult(json, model) {
  return {
    content: [{ type: 'text', text: json.result ?? '' }],
    usage: json.usage ?? { input_tokens: 0, output_tokens: 0 },
    stop_reason: json.stop_reason ?? 'end_turn',
    model,
  };
}

/**
 * Spawn one `claude -p` process and resolve to an Anthropic-shaped message.
 * Kept at module scope so Sonar nesting limits stay under the Promise handlers.
 * @param {{
 *   spawnImpl: Function,
 *   cliPath: string,
 *   args: string[],
 *   env: NodeJS.ProcessEnv,
 *   prompt: string,
 *   model: string,
 * }} opts
 * @returns {Promise<object>}
 */
function spawnCliJsonMessage({ spawnImpl, cliPath, args, env, prompt, model }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnImpl(cliPath, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeoutMs = cliTimeoutMs();
    const timer = setTimeout(() => {
      finish(new Error(`claude-cli timeout after ${timeoutMs}ms (model=${model})`));
      child.kill('SIGKILL');
    }, timeoutMs);

    function finish(err, message) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) rejectPromise(err);
      else resolvePromise(message);
    }

    function failWithReset(message, resetSource) {
      const err = new Error(message);
      err.limitResetEpochMs = parseLimitResetEpochMs(resetSource);
      finish(err);
    }

    child.on('error', (err) => finish(new Error(`claude-cli spawn failed: ${err.message}`)));
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) {
        failWithReset(
          `claude-cli exited with code ${code} (model=${model}): ${cliFailureText(stdout, stderr)}`,
          `${stdout}\n${stderr}`,
        );
        return;
      }
      let json;
      try {
        json = JSON.parse(stdout);
      } catch {
        finish(new Error(`claude-cli returned non-JSON output: ${tail(stdout, 200)}`));
        return;
      }
      if (json?.type !== 'result' || json.is_error || json.subtype !== 'success') {
        failWithReset(
          `claude-cli result error (subtype=${json?.subtype ?? 'unknown'}): ${tail(json?.result ?? stderr)}`,
          String(json?.result ?? ''),
        );
        return;
      }
      finish(null, mapCliResult(json, model));
    });

    child.stdin.on('error', () => {}); // EPIPE if the child dies early; surfaced via close
    child.stdin.end(prompt);
  });
}

/** Async iterable that emits no deltas (awaits settle so for-await completes after the call). */
function noDeltaStream(settlePromise) {
  return {
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        async next() {
          if (done) return { done: true, value: undefined };
          done = true;
          await settlePromise.catch(() => {});
          return { done: true, value: undefined };
        },
      };
    },
  };
}

/**
 * @param {{ defaultModel?: string, cliPath?: string, spawnImpl?: Function, anthropicPort?: object, apiKey?: string }} [cfg]
 * @returns {import('./ILlmPort.js').LlmPort & { transport: 'claude-cli' }}
 */
export function createClaudeCliLlmPort(cfg = {}) {
  const spawnImpl = cfg.spawnImpl ?? nodeSpawn;
  const cliPath = cfg.cliPath ?? process.env.CLAUDE_CLI_PATH ?? 'claude';
  let anthropicPort = cfg.anthropicPort ?? null;
  let mode = 'cli';        // 'cli' | 'api' — sticky once switched to API credits
  let stickyChoice = null; // user's ask-prompt decision, asked at most once per process
  let limitGate = null;    // shared promise while one limit event is being resolved
  let waitedTotalMs = 0;   // cumulative limit waiting, reset on the next successful call

  function getAnthropicPort() {
    anthropicPort ??= createAnthropicLlmPort(cfg);
    return anthropicPort;
  }

  function apiAvailable() {
    return apiOnLimitAllowed() && (Boolean(process.env.ANTHROPIC_API_KEY) || cfg.anthropicPort != null);
  }

  function switchToApi(why) {
    mode = 'api';
    console.error(`  ⚠ claude-cli transport → API credits (${why}); remaining calls bill at metered prices.`);
  }

  // Small semaphore: subscription rate limits are shared with the interactive session.
  let active = 0;
  const waiters = [];
  async function withSlot(fn) {
    if (active >= cliMaxConcurrency()) {
      await new Promise((resolveWait) => waiters.push(resolveWait));
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    }
  }

  function runCli(opts) {
    const model = opts?.model ?? cfg.defaultModel;
    if (!model) throw new Error('claude-cli transport: model is required');
    const systemText = normalizeSystemText(opts?.system);
    const prompt = normalizeMessagesToPrompt(opts?.messages);

    const args = [
      '-p',
      '--output-format', 'json',
      '--model', model,
      '--tools', '',
      '--no-session-persistence',
      '--disable-slash-commands',
    ];
    if (systemText) args.push('--system-prompt', systemText);

    const env = { ...process.env };
    for (const k of STRIPPED_ENV_KEYS) delete env[k];

    return withSlot(() => spawnCliJsonMessage({
      spawnImpl, cliPath, args, env, prompt, model,
    }));
  }

  /** Block until the reported reset time (waiting is capped), or switch on "a". */
  async function waitOutLimit(err) {
    const resetMs = err.limitResetEpochMs ?? null;
    const deadline = resetMs
      ? resetMs + limitResetBufferMs()
      : Date.now() + limitPollMs();
    const waitMs = Math.max(deadline - Date.now(), MIN_WAIT_MS);
    if (waitedTotalMs + waitMs > limitWaitMaxMs()) {
      throw new Error(
        `claude-cli subscription limit: waited ${fmtDuration(waitedTotalMs)} ` +
        `(LLM_CLI_WAIT_MAX_MS cap) — ${err.message}`,
      );
    }
    waitedTotalMs += waitMs;
    const until = Date.now() + waitMs;
    console.error(
      `  ⏸ subscription limit — waiting until ${fmtClock(until)} (${fmtDuration(waitMs)}) ` +
      'to continue on subscription' +
      (apiAvailable() && isInteractive() ? ' (press "a" to continue now on API credits)' : ''),
    );
    const outcome = await waitUntil(until, apiAvailable());
    if (outcome === 'api') switchToApi('user keypress during wait');
  }

  /**
   * Decide what to do about a subscription-limit error. Runs once per limit
   * event (concurrent calls share the gate). Resolving means "retry on CLI or
   * mode is now 'api'"; throwing propagates to every blocked call.
   */
  async function resolveLimitEvent(err) {
    let strategy = limitStrategy();
    if ((strategy === 'api' || strategy === 'ask') && !apiAvailable()) strategy = 'wait';
    if (strategy === 'fail') throw err;
    if (strategy === 'api') { switchToApi('LLM_CLI_LIMIT_STRATEGY=api'); return; }
    if (strategy === 'ask' && stickyChoice == null && isInteractive()) {
      stickyChoice = await promptLimitChoice(err.limitResetEpochMs ?? null);
    }
    if (stickyChoice === 'api') { switchToApi('user choice'); return; }
    await waitOutLimit(err);
  }

  /** runCli under the subscription-limit policy (wait / ask / api / fail). */
  async function runWithLimitPolicy(opts) {
    for (;;) {
      if (mode === 'api') return getAnthropicPort().createMessage(opts);
      if (limitGate) { await limitGate; continue; }
      try {
        const message = await runCli(opts);
        waitedTotalMs = 0;
        return message;
      } catch (err) {
        if (mode !== 'cli' || !isSubscriptionLimitError(err)) throw err;
        limitGate ??= resolveLimitEvent(err).finally(() => { limitGate = null; });
        await limitGate;
      }
    }
  }

  return {
    // Dynamic: after a switch to API credits the port stops reporting claude-cli
    // so the gateway and cost trackers bill the remaining calls at real prices.
    get transport() {
      return mode === 'api' ? undefined : 'claude-cli';
    },
    createMessage: (opts) => runWithLimitPolicy(opts),
    stream: (opts) => {
      const resultPromise = runWithLimitPolicy(opts);
      // streamWithProgress does `for await` and only reads delta events; zero
      // events is legal. Errors surface from finalMessage(), inside withLlmRetry.
      return {
        ...noDeltaStream(resultPromise),
        finalMessage: () => resultPromise,
      };
    },
    runToolLoop: (opts) => {
      // Lazy: constructing the SDK client without a key throws, and pure
      // extract runs under this transport legitimately have no key.
      return getAnthropicPort().runToolLoop(opts);
    },
    defaultModel: cfg.defaultModel,
  };
}
