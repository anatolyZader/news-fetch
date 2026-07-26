import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  createClaudeCliLlmPort,
  normalizeSystemText,
  normalizeMessagesToPrompt,
} from '../../../cross-cut-modules/llm/claudeCliLlmAdapter.js';

const RESULT_JSON = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  stop_reason: 'end_turn',
  result: '[{"ok":true}]',
  usage: { input_tokens: 100, output_tokens: 20 },
  total_cost_usd: 0.001,
  num_turns: 1,
};

/** Scripted child process: emits stdout/stderr then close. */
function fakeChild({ stdout = '', stderr = '', exitCode = 0 } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = Object.assign(new EventEmitter(), {
    written: '',
    end(data) { this.written = data ?? ''; },
  });
  child.kill = () => {};
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', stdout);
    if (stderr) child.stderr.emit('data', stderr);
    child.emit('close', exitCode);
  });
  return child;
}

function makeSpawnRecorder(childFactory) {
  const calls = [];
  const spawnImpl = (cmd, args, opts) => {
    const child = childFactory();
    calls.push({ cmd, args, opts, child });
    return child;
  };
  return { calls, spawnImpl };
}

const OPTS = {
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 4000,
  temperature: 0,
  system: 'You extract signals.',
  messages: [{ role: 'user', content: 'ARTICLES...' }],
};

const savedKey = {};
beforeEach(() => {
  savedKey.v = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'sk-test-should-not-leak';
});
afterEach(() => {
  if (savedKey.v === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey.v;
});

describe('claudeCliLlmAdapter createMessage', () => {
  it('spawns claude -p with the right flags, prompt on stdin, and maps the result', async () => {
    const { calls, spawnImpl } = makeSpawnRecorder(() => fakeChild({ stdout: JSON.stringify(RESULT_JSON) }));
    const port = createClaudeCliLlmPort({ spawnImpl, cliPath: 'claude' });

    const message = await port.createMessage(OPTS);

    assert.equal(calls.length, 1);
    const { cmd, args, opts, child } = calls[0];
    assert.equal(cmd, 'claude');
    assert.ok(args.includes('-p'));
    assert.deepEqual(args.slice(args.indexOf('--output-format'), args.indexOf('--output-format') + 2), ['--output-format', 'json']);
    assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), ['--model', OPTS.model]);
    assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', '']);
    assert.ok(args.includes('--no-session-persistence'));
    assert.ok(args.includes('--disable-slash-commands'));
    assert.deepEqual(args.slice(args.indexOf('--system-prompt'), args.indexOf('--system-prompt') + 2), ['--system-prompt', 'You extract signals.']);
    assert.equal(child.stdin.written, 'ARTICLES...');
    assert.equal(opts.env.ANTHROPIC_API_KEY, undefined);

    assert.deepEqual(message, {
      content: [{ type: 'text', text: '[{"ok":true}]' }],
      usage: { input_tokens: 100, output_tokens: 20 },
      stop_reason: 'end_turn',
      model: OPTS.model,
    });
  });

  it('rejects on non-zero exit with stderr in the message', async () => {
    const { spawnImpl } = makeSpawnRecorder(() => fakeChild({ stderr: 'disk error', exitCode: 1 }));
    const port = createClaudeCliLlmPort({ spawnImpl });
    await assert.rejects(() => port.createMessage(OPTS), /exited with code 1.*disk error/s);
  });

  it('rejects on malformed stdout', async () => {
    const { spawnImpl } = makeSpawnRecorder(() => fakeChild({ stdout: 'not json' }));
    const port = createClaudeCliLlmPort({ spawnImpl });
    await assert.rejects(() => port.createMessage(OPTS), /non-JSON/);
  });

  it('rejects on error subtype / is_error results', async () => {
    const bad = { ...RESULT_JSON, subtype: 'error_during_execution', is_error: true };
    const { spawnImpl } = makeSpawnRecorder(() => fakeChild({ stdout: JSON.stringify(bad) }));
    const port = createClaudeCliLlmPort({ spawnImpl });
    await assert.rejects(() => port.createMessage(OPTS), /error_during_execution/);
  });
});

describe('claudeCliLlmAdapter stream', () => {
  it('returns an iterable whose finalMessage resolves to the mapped message', async () => {
    const { spawnImpl } = makeSpawnRecorder(() => fakeChild({ stdout: JSON.stringify(RESULT_JSON) }));
    const port = createClaudeCliLlmPort({ spawnImpl });

    const stream = port.stream(OPTS);
    const events = [];
    for await (const ev of stream) events.push(ev);
    assert.deepEqual(events, []);
    const message = await stream.finalMessage();
    assert.equal(message.content[0].text, '[{"ok":true}]');
  });

  it('iteration completes and finalMessage rejects on failure', async () => {
    const { spawnImpl } = makeSpawnRecorder(() => fakeChild({ stderr: 'boom', exitCode: 2 }));
    const port = createClaudeCliLlmPort({ spawnImpl });

    const stream = port.stream(OPTS);
    for await (const ev of stream) assert.fail(`unexpected event ${ev}`);
    await assert.rejects(() => stream.finalMessage(), /exited with code 2/);
  });
});

describe('claudeCliLlmAdapter runToolLoop + port shape', () => {
  it('delegates runToolLoop to the injected anthropic port without spawning', async () => {
    const { calls, spawnImpl } = makeSpawnRecorder(() => fakeChild({}));
    const seen = [];
    const port = createClaudeCliLlmPort({
      spawnImpl,
      anthropicPort: { runToolLoop: async (o) => { seen.push(o); return { lastAssistantText: 'done' }; } },
    });
    const res = await port.runToolLoop({ model: 'claude-sonnet-4-6' });
    assert.equal(res.lastAssistantText, 'done');
    assert.equal(seen.length, 1);
    assert.equal(calls.length, 0);
  });

  it('exposes transport for gateway cost handling', () => {
    const port = createClaudeCliLlmPort({ spawnImpl: () => fakeChild({}) });
    assert.equal(port.transport, 'claude-cli');
  });
});

describe('claudeCliLlmAdapter prompt normalization', () => {
  it('normalizes the three system shapes', () => {
    assert.equal(normalizeSystemText('plain'), 'plain');
    assert.equal(normalizeSystemText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'a\nb');
    assert.equal(normalizeSystemText({ stable: 'core', dynamic: 'today' }), 'core\n\ntoday');
    assert.equal(normalizeSystemText(null), '');
  });

  it('passes a single user turn through verbatim and labels multi-turn transcripts', () => {
    assert.equal(normalizeMessagesToPrompt([{ role: 'user', content: 'hi' }]), 'hi');
    const multi = normalizeMessagesToPrompt([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
      { role: 'user', content: 'follow-up' },
    ]);
    assert.equal(multi, '[user]\nq\n\n[assistant]\na\n\n[user]\nfollow-up');
  });

  it('throws on unsupported content blocks', () => {
    assert.throws(
      () => normalizeMessagesToPrompt([{ role: 'user', content: [{ type: 'image', source: {} }] }]),
      /unsupported message block/,
    );
  });
});

describe('claudeCliLlmAdapter subscription-limit fallback', () => {
  const API_MESSAGE = {
    content: [{ type: 'text', text: 'api-rescue' }],
    usage: { input_tokens: 5, output_tokens: 5 },
    stop_reason: 'end_turn',
    model: OPTS.model,
  };

  it('falls back to the API port on a usage-limit error and stays there (sticky)', async () => {
    const { calls, spawnImpl } = makeSpawnRecorder(() =>
      fakeChild({ stderr: 'Claude usage limit reached — resets at 14:00', exitCode: 1 }));
    const apiCalls = [];
    const port = createClaudeCliLlmPort({
      spawnImpl,
      anthropicPort: { createMessage: async (o) => { apiCalls.push(o); return API_MESSAGE; } },
    });

    assert.equal(port.transport, 'claude-cli');
    const first = await port.createMessage(OPTS);
    assert.equal(first.content[0].text, 'api-rescue');
    assert.equal(port.transport, undefined); // billing flag flipped

    const second = await port.createMessage(OPTS);
    assert.equal(second.content[0].text, 'api-rescue');
    assert.equal(calls.length, 1);     // CLI tried once, never again
    assert.equal(apiCalls.length, 2);  // both served by the API port
  });

  it('stream finalMessage is rescued by the fallback too', async () => {
    const { spawnImpl } = makeSpawnRecorder(() =>
      fakeChild({ stderr: 'rate limit exceeded', exitCode: 1 }));
    const port = createClaudeCliLlmPort({
      spawnImpl,
      anthropicPort: { createMessage: async () => API_MESSAGE },
    });
    const stream = port.stream(OPTS);
    for await (const ev of stream) assert.fail(`unexpected event ${ev}`);
    const message = await stream.finalMessage();
    assert.equal(message.content[0].text, 'api-rescue');
  });

  it('does not fall back on non-limit errors', async () => {
    const { spawnImpl } = makeSpawnRecorder(() => fakeChild({ stderr: 'segfault', exitCode: 1 }));
    const port = createClaudeCliLlmPort({
      spawnImpl,
      anthropicPort: { createMessage: async () => API_MESSAGE },
    });
    await assert.rejects(() => port.createMessage(OPTS), /exited with code 1/);
    assert.equal(port.transport, 'claude-cli');
  });

  it('respects LLM_CLI_FALLBACK=0', async () => {
    const prev = process.env.LLM_CLI_FALLBACK;
    process.env.LLM_CLI_FALLBACK = '0';
    try {
      const { spawnImpl } = makeSpawnRecorder(() =>
        fakeChild({ stderr: 'usage limit reached', exitCode: 1 }));
      const port = createClaudeCliLlmPort({
        spawnImpl,
        anthropicPort: { createMessage: async () => API_MESSAGE },
      });
      await assert.rejects(() => port.createMessage(OPTS), /usage limit/);
    } finally {
      if (prev == null) delete process.env.LLM_CLI_FALLBACK;
      else process.env.LLM_CLI_FALLBACK = prev;
    }
  });
});

describe('getDefaultLlmPort LLM_FORCE_API override', () => {
  it('ignores LLM_TRANSPORT=claude-cli when LLM_FORCE_API=1', async () => {
    const { getDefaultLlmPort, setSharedLlmPort } = await import('../../../cross-cut-modules/llm/anthropicLlmAdapter.js');
    const saved = { t: process.env.LLM_TRANSPORT, f: process.env.LLM_FORCE_API };
    setSharedLlmPort(null);
    process.env.LLM_TRANSPORT = 'claude-cli';
    process.env.LLM_FORCE_API = '1';
    try {
      assert.equal(getDefaultLlmPort().transport, undefined);
      setSharedLlmPort(null);
      delete process.env.LLM_FORCE_API;
      assert.equal(getDefaultLlmPort().transport, 'claude-cli');
    } finally {
      setSharedLlmPort(null);
      if (saved.t == null) delete process.env.LLM_TRANSPORT; else process.env.LLM_TRANSPORT = saved.t;
      if (saved.f == null) delete process.env.LLM_FORCE_API; else process.env.LLM_FORCE_API = saved.f;
    }
  });
});
