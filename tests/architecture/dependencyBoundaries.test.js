import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('dependency-cruiser reports zero error violations', () => {
  const result = spawnSync(
    'npm',
    ['run', 'deps:boundaries', '--', '--output-type', 'json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout?.slice(0, 2000));

  const jsonStart = result.stdout.indexOf('{');
  assert.ok(jsonStart >= 0, 'expected JSON output from dependency-cruiser');
  const payload = JSON.parse(result.stdout.slice(jsonStart));
  const violations = payload.summary?.violations ?? [];
  const errors = violations.filter((v) => v.rule?.severity === 'error');

  assert.equal(
    errors.length,
    0,
    errors.map((v) => `${v.rule.name}: ${v.from} -> ${v.to}`).join('\n'),
  );
});
