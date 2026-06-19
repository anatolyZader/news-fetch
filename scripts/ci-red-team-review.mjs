#!/usr/bin/env node
/**
 * Red Team CI review: LLM attacker mindset on git diff + changed API routes.
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAnthropicLlmPort } from '../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { extractJson } from '../cross-cut-modules/resilience-contracts/jsonExtract.js';
import { notifySecurityEvent } from '../cross-cut-modules/security/app/securityNotifier.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)));
const MAX_DIFF_BYTES = 80 * 1024;
const RED_TEAM_MODEL = process.env.SECURITY_RED_TEAM_MODEL ?? 'claude-haiku-4-5-20251001';

function runGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const stdout = err.stdout?.toString?.() ?? '';
    if (stdout) return stdout.trim();
    return '';
  }
}

function resolveBaseRef() {
  if (process.env.SECURITY_RED_TEAM_BASE_REF?.trim()) {
    return process.env.SECURITY_RED_TEAM_BASE_REF.trim();
  }
  if (process.env.GITHUB_BASE_REF?.trim()) {
    return `origin/${process.env.GITHUB_BASE_REF.trim()}`;
  }
  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  return 'HEAD~1';
}

function getDiff(baseRef) {
  const diff = runGit(`diff ${baseRef}...HEAD -- . ':(exclude)docs/' ':(exclude)client/dist/' ':(exclude)coverage/'`);
  if (diff) return diff.slice(0, MAX_DIFF_BYTES);
  return runGit(`diff ${baseRef} HEAD -- . ':(exclude)docs/' ':(exclude)client/dist/' ':(exclude)coverage/'`).slice(0, MAX_DIFF_BYTES);
}

function listChangedFiles(baseRef) {
  const out = runGit(`diff --name-only ${baseRef}...HEAD`);
  if (out) return out.split('\n').filter(Boolean);
  return runGit(`diff --name-only ${baseRef} HEAD`).split('\n').filter(Boolean);
}

function collectRouteHints(changedFiles) {
  /** @type {string[]} */
  const hints = [];

  for (const file of changedFiles) {
    if (file.endsWith('Routes.js') || file.includes('/input/') && file.endsWith('.js')) {
      hints.push(relative(ROOT, join(ROOT, file)).replaceAll('\\', '/'));
    }
  }

  const openapiPath = join(ROOT, 'openapi/openapi.yaml');
  if (existsSync(openapiPath) && changedFiles.some((f) => f.includes('openapi'))) {
    const yaml = readFileSync(openapiPath, 'utf8');
    const paths = [...yaml.matchAll(/^\s{2}(\/api\/[^\s:]+):/gm)].map((m) => m[1]);
    hints.push(...paths.slice(0, 50).map((p) => `openapi:${p}`));
  }

  return [...new Set(hints)].slice(0, 40);
}

function buildPrompt(diff, routeHints) {
  return (
    'You are a Red Team security reviewer. Analyze ONLY the git diff below for exploitable vulnerabilities.\n' +
    'Focus: SQL injection, XSS, CSRF, IDOR, missing auth on mutations, SSRF on user URLs, prompt injection in LLM ingest, secret leakage.\n' +
    'For each new/changed API endpoint, assess OWASP risks from an attacker mindset — not formal SAST.\n\n' +
    'Return ONLY valid JSON:\n' +
    '{"findings":[{"severity":"critical|warning|info","category":"SQLi|XSS|CSRF|IDOR|auth|ssrf|prompt_injection|secrets|other","endpoint":"path or file","summary":"one line","evidence":"code snippet or reasoning"}]}\n\n' +
    'Severity guide:\n' +
    '- critical: likely exploitable without insider access\n' +
    '- warning: risky pattern needing review\n' +
    '- info: hardening suggestion\n\n' +
    `Changed route hints: ${routeHints.length ? routeHints.join(', ') : '(none)'}\n\n` +
    '--- GIT DIFF START ---\n' +
    diff +
    '\n--- GIT DIFF END ---'
  );
}

/**
 * @param {unknown} parsed
 * @returns {Array<{ severity: string, category: string, endpoint: string, summary: string, evidence: string }>}
 */
function normalizeFindings(parsed) {
  const findings = Array.isArray(parsed?.findings) ? parsed.findings : [];
  return findings
    .filter((f) => f && typeof f === 'object')
    .map((f) => ({
      severity: String(f.severity ?? 'info').toLowerCase(),
      category: String(f.category ?? 'other'),
      endpoint: String(f.endpoint ?? 'unknown'),
      summary: String(f.summary ?? '').slice(0, 500),
      evidence: String(f.evidence ?? '').slice(0, 500),
    }));
}

async function main() {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? '').trim();
  if (!apiKey) {
    console.log('::notice::ANTHROPIC_API_KEY not set — skipping Red Team review.');
    process.exit(0);
  }

  if (process.env.GITHUB_EVENT_NAME === 'pull_request' && process.env.GITHUB_HEAD_REPO_FULL_NAME && process.env.GITHUB_REPOSITORY
    && process.env.GITHUB_HEAD_REPO_FULL_NAME !== process.env.GITHUB_REPOSITORY) {
    console.log('::notice::Fork PR — skipping Red Team review (no secrets on fork workflows).');
    process.exit(0);
  }

  const baseRef = resolveBaseRef();
  const baseSha = runGit(`rev-parse --verify ${baseRef}`);
  if (!baseSha) {
    console.log(`::notice::Base ref ${baseRef} unavailable — skipping Red Team review.`);
    process.exit(0);
  }

  const changedFiles = listChangedFiles(baseRef);
  const codeChanges = changedFiles.filter((f) => /\.(js|mjs|cjs|yaml|yml)$/.test(f) && !f.startsWith('docs/'));
  if (codeChanges.length === 0) {
    console.log('No code changes detected — skipping Red Team review.');
    process.exit(0);
  }

  const diff = getDiff(baseRef);
  if (!diff.trim()) {
    console.log('Empty diff — skipping Red Team review.');
    process.exit(0);
  }

  const routeHints = collectRouteHints(changedFiles);
  const llm = createAnthropicLlmPort({ apiKey });
  const response = await llm.createMessage({
    model: RED_TEAM_MODEL,
    max_tokens: 2048,
    temperature: 0,
    system: 'You are a security Red Team reviewer. Output JSON only, no markdown fences.',
    messages: [{ role: 'user', content: buildPrompt(diff, routeHints) }],
  });

  const textBlock = response.content?.find((b) => b.type === 'text');
  const rawText = textBlock?.text ?? '';
  let findings = [];
  try {
    findings = normalizeFindings(extractJson(rawText));
  } catch (err) {
    console.error('Failed to parse Red Team JSON:', err.message);
    console.error('Raw response:', rawText.slice(0, 500));
    process.exit(1);
  }

  const critical = findings.filter((f) => f.severity === 'critical');
  const warning = findings.filter((f) => f.severity === 'warning');
  const info = findings.filter((f) => f.severity === 'info');

  console.log(`Red Team review: ${findings.length} finding(s) — critical=${critical.length} warning=${warning.length} info=${info.length}`);

  for (const f of findings) {
    console.log(`  [${f.severity}] ${f.category} @ ${f.endpoint}: ${f.summary}`);
  }

  for (const f of info) {
    await notifySecurityEvent({
      tier: 'info',
      action: 'security.red_team.finding',
      summary: f.summary,
      meta: f,
    });
  }

  for (const f of warning) {
    await notifySecurityEvent({
      tier: 'warning',
      action: 'security.red_team.finding',
      summary: f.summary,
      meta: f,
    });
  }

  for (const f of critical) {
    await notifySecurityEvent({
      tier: 'critical',
      action: 'security.red_team.finding',
      summary: f.summary,
      meta: f,
    });
  }

  if (critical.length > 0) {
    console.error(`Red Team FAILED: ${critical.length} critical finding(s).`);
    process.exit(1);
  }

  console.log('Red Team review passed (no critical findings).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
