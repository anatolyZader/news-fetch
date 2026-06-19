#!/usr/bin/env node
/**
 * CI supply-chain checks: osv-scanner + lockfile diff maintainer warnings.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { notifySecurityEvent } from '../cross-cut-modules/security/app/securityNotifier.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWLIST_PATH = join(ROOT, 'security/osv-allowlist.json');
const LOCKFILE = join(ROOT, 'package-lock.json');

function runGit(args) {
  try {
    return execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    return err.stdout?.toString?.()?.trim() ?? '';
  }
}

function resolveBaseRef() {
  if (process.env.SECURITY_SUPPLY_CHAIN_BASE_REF?.trim()) {
    return process.env.SECURITY_SUPPLY_CHAIN_BASE_REF.trim();
  }
  if (process.env.GITHUB_BASE_REF?.trim()) {
    return `origin/${process.env.GITHUB_BASE_REF.trim()}`;
  }
  return 'HEAD~1';
}

/**
 * @param {string} lockfilePath
 * @returns {Map<string, string>}
 */
function parseDirectDeps(lockfilePath) {
  const pkg = JSON.parse(readFileSync(lockfilePath, 'utf8'));
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const [name, spec] of Object.entries(pkg.packages?.['']?.dependencies ?? pkg.dependencies ?? {})) {
    out.set(name, String(spec));
  }
  return out;
}

/**
 * @param {string} pkgName
 * @returns {Promise<string[]>}
 */
async function fetchMaintainers(pkgName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(pkgName)}`, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const maintainers = data.maintainers ?? [];
    return maintainers.map((m) => m.name ?? m.email ?? String(m));
  } catch {
    return [];
  }
}

function loadOsvAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return { ids: [] };
  return JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
}

function installOsvScanner() {
  const check = spawnSync('osv-scanner', ['--version'], { encoding: 'utf8' });
  if (check.status === 0) return 'osv-scanner';

  const goBin = `${process.env.HOME}/go/bin/osv-scanner`;
  const goCheck = spawnSync(goBin, ['--version'], { encoding: 'utf8' });
  if (goCheck.status === 0) return goBin;

  console.log('Installing osv-scanner…');
  const install = spawnSync('go', ['install', 'github.com/google/osv-scanner/v2/cmd/osv-scanner@latest'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${process.env.HOME}/go/bin:${process.env.PATH ?? ''}` },
  });
  if (install.status !== 0) {
    console.log('::warning::go/osv-scanner unavailable — skipping OSV scan.');
    return null;
  }
  return goBin;
}

function collectOsvVulnerabilities(parsed, allowlist) {
  /** @type {Array<{ id: string, package: string, severity: string }>} */
  const vulns = [];

  for (const scanResult of parsed.results ?? []) {
    for (const pkg of scanResult.packages ?? []) {
      for (const vuln of pkg.vulnerabilities ?? []) {
        const id = vuln.id ?? vuln.osv_id ?? 'unknown';
        if (allowlist.has(id)) continue;
        const severity = (vuln.severity ?? [{ type: 'Unknown', score: '0' }])[0]?.type ?? 'Unknown';
        const sevUpper = String(severity).toUpperCase();
        if (sevUpper !== 'CRITICAL' && sevUpper !== 'HIGH') continue;
        vulns.push({
          id,
          package: pkg.package?.name ?? 'unknown',
          severity: String(severity),
        });
      }
    }
  }

  return vulns;
}

async function runOsvScanner() {
  const bin = installOsvScanner();
  if (!bin) return { failed: false, vulns: [] };

  const result = spawnSync(
    bin,
    ['--lockfile', 'package-lock.json', '--format', 'json'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );

  if (result.status !== 0 && !result.stdout?.trim()) {
    console.error(result.stderr ?? 'osv-scanner failed');
    process.exit(1);
  }

  let parsed = { results: [] };
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch {
    console.error('Failed to parse osv-scanner output');
    process.exit(1);
  }

  const allowlist = new Set(loadOsvAllowlist().ids ?? []);
  const vulns = collectOsvVulnerabilities(parsed, allowlist);
  return { failed: vulns.length > 0, vulns };
}

async function checkLockfileMaintainers() {
  if (!existsSync(LOCKFILE)) {
    console.log('No package-lock.json — skipping maintainer diff.');
    return { newDirectDeps: [], warnings: [] };
  }

  const baseRef = resolveBaseRef();
  const baseSha = runGit(`rev-parse --verify ${baseRef}`);
  if (!baseSha) {
    console.log(`Base ref ${baseRef} unavailable — skipping maintainer diff.`);
    return { newDirectDeps: [], warnings: [] };
  }

  let baseLock;
  try {
    baseLock = execSync(`git show ${baseRef}:package-lock.json`, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    console.log('No base lockfile — skipping maintainer diff.');
    return { newDirectDeps: [], warnings: [] };
  }

  const tmpBase = join(ROOT, '.tmp-base-lock.json');
  writeFileSync(tmpBase, baseLock);

  const currentDeps = parseDirectDeps(LOCKFILE);
  const baseDeps = parseDirectDeps(tmpBase);

  /** @type {string[]} */
  const newDirectDeps = [];
  /** @type {Array<{ name: string, version: string, maintainers: string[] }>} */
  const warnings = [];

  for (const [name, version] of currentDeps) {
    const prev = baseDeps.get(name);
    if (!prev) {
      newDirectDeps.push(name);
    }
    if (prev !== version) {
      const maintainers = await fetchMaintainers(name);
      warnings.push({ name, version: `${prev ?? '(new)'} → ${version}`, maintainers });
    }
  }

  try {
    unlinkSync(tmpBase);
  } catch {
    // ignore cleanup errors
  }

  return { newDirectDeps, warnings };
}

async function main() {
  console.log('Running npm audit (ci-audit)…');
  const audit = spawnSync('node', ['scripts/ci-audit.mjs'], { cwd: ROOT, encoding: 'utf8' });
  if (audit.stdout) process.stdout.write(audit.stdout);
  if (audit.stderr) process.stderr.write(audit.stderr);
  if (audit.status !== 0) {
    await notifySecurityEvent({
      tier: 'critical',
      action: 'supply_chain.npm_audit',
      summary: 'npm audit reported disallowed high/critical vulnerabilities',
    });
    process.exit(1);
  }

  const osv = await runOsvScanner();
  if (osv.failed) {
    for (const v of osv.vulns) {
      await notifySecurityEvent({
        tier: 'critical',
        action: 'supply_chain.osv',
        summary: `${v.package}: ${v.id} (${v.severity})`,
        meta: v,
      });
    }
    console.error('OSV scanner failed — high/critical vulnerabilities found.');
    for (const v of osv.vulns) {
      console.error(`  [${v.severity}] ${v.package}: ${v.id}`);
    }
    process.exit(1);
  }
  console.log('OSV scanner OK.');

  const { newDirectDeps, warnings } = await checkLockfileMaintainers();

  for (const w of warnings) {
    await notifySecurityEvent({
      tier: 'warning',
      action: 'supply_chain.maintainer_change',
      summary: `${w.name} version changed (${w.version})`,
      meta: { maintainers: w.maintainers },
    });
    console.log(`::warning::Dependency ${w.name} changed: ${w.version}; maintainers: ${w.maintainers.join(', ') || 'unknown'}`);
  }

  if (newDirectDeps.length > 0) {
    for (const name of newDirectDeps) {
      const maintainers = await fetchMaintainers(name);
      await notifySecurityEvent({
        tier: 'warning',
        action: 'supply_chain.new_direct_dep',
        summary: `New direct dependency: ${name}`,
        meta: { maintainers },
      });
      console.log(`::warning::New direct dependency: ${name}; maintainers: ${maintainers.join(', ') || 'unknown'}`);
    }
  }

  console.log('Supply-chain checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
