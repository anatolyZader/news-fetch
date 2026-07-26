/**
 * Claude Code CLI adapter implementing the LLM transport port (see ./ILlmPort.js).
 *
 * Routes single-shot calls (`createMessage`, `stream`) through a spawned
 * `claude -p` process so inference bills to the operator's Max subscription
 * instead of metered API credits. `runToolLoop` (caller-defined JS tools)
 * cannot run inside `claude -p` and delegates to the Anthropic SDK adapter,
 * which still requires ANTHROPIC_API_KEY.
 *
 * Selected via LLM_TRANSPORT=claude-cli in getDefaultLlmPort(). Intended for
 * pipeline CLI runs launched from an interactive Claude Code session (the
 * spawned CLI inherits the subscription login); never set it in the server
 * environment — SSE chat depends on real delta streaming.
 */
import { spawn as nodeSpawn } from 'node:child_process';
import { createAnthropicLlmPort } from './anthropicLlmAdapter.js';

const STRIPPED_ENV_KEYS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'];

function cliTimeoutMs() {
  const n = Number.parseInt(process.env.LLM_CLI_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 900_000;
}

function cliMaxConcurrency() {
  const n = Number.parseInt(process.env.LLM_CLI_MAX_CONCURRENCY ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

/** Automatic API fallback on subscription limits — on unless LLM_CLI_FALLBACK=0. */
function cliFallbackEnabled() {
  const v = process.env.LLM_CLI_FALLBACK?.trim().toLowerCase();
  return v !== '0' && v !== 'false';
}

/** Errors that mean the Max subscription quota is exhausted (not a transient blip). */
export function isSubscriptionLimitError(err) {
  const msg = String(err?.message ?? '');
  return /usage limit|limit reached|weekly limit|5-hour|rate.?limit|too many requests|\b429\b|quota/i.test(msg);
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

    child.on('error', (err) => finish(new Error(`claude-cli spawn failed: ${err.message}`)));
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`claude-cli exited with code ${code} (model=${model}): ${tail(stderr)}`));
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
        finish(new Error(
          `claude-cli result error (subtype=${json?.subtype ?? 'unknown'}): ${tail(json?.result ?? stderr)}`,
        ));
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
  // Sticky: once the subscription limit is hit, the rest of this process
  // bills to API credits so urgent runs are never stranded mid-pipeline.
  let fallbackToApi = false;

  function getAnthropicPort() {
    anthropicPort ??= createAnthropicLlmPort(cfg);
    return anthropicPort;
  }

  function canFallBack() {
    return cliFallbackEnabled() && (Boolean(process.env.ANTHROPIC_API_KEY) || cfg.anthropicPort != null);
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

  /** createMessage via the API SDK — used after a sticky limit fallback. */
  async function apiMessage(opts) {
    return getAnthropicPort().createMessage(opts);
  }

  /** runCli with automatic sticky fallback to API credits on subscription limits. */
  async function runWithFallback(opts) {
    if (fallbackToApi) return apiMessage(opts);
    try {
      return await runCli(opts);
    } catch (err) {
      if (!isSubscriptionLimitError(err) || !canFallBack()) throw err;
      fallbackToApi = true;
      console.error(
        `  ⚠ claude-cli subscription limit hit (${String(err.message).slice(0, 120)}) — ` +
        'falling back to API credits for the remainder of this run.',
      );
      return apiMessage(opts);
    }
  }

  return {
    // Dynamic: after a limit fallback the port stops reporting claude-cli so
    // the gateway and cost trackers bill the remaining calls at real prices.
    get transport() {
      return fallbackToApi ? undefined : 'claude-cli';
    },
    createMessage: (opts) => runWithFallback(opts),
    stream: (opts) => {
      const resultPromise = runWithFallback(opts);
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
