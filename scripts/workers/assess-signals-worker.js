#!/usr/bin/env node
/**
 * Worker entry: run assess-signals CLI with WORKER_MODE=assess.
 */
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const child = spawn(
  process.execPath,
  [resolve(repoRoot, 'business_modules/resilience/input/assess-signals.js'), ...process.argv.slice(2)],
  { stdio: 'inherit', env: { ...process.env, WORKER_MODE: 'assess' } },
);
child.on('exit', (code) => process.exit(code ?? 0));
