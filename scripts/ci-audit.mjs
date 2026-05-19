#!/usr/bin/env node
/**
 * CI security audit: fail on high/critical except documented dependency exceptions.
 */
import { execSync } from 'node:child_process';

/** Dependency names allowed to report high severity (no npm fix). */
const ALLOW_HIGH = new Set(['xlsx']);

function loadAuditJson() {
  try {
    return execSync('npm audit --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (err) {
    const stdout = err.stdout?.toString() ?? '';
    if (!stdout.trim()) {
      console.error(err.stderr?.toString() ?? err.message);
      process.exit(1);
    }
    return stdout;
  }
}

const audit = JSON.parse(loadAuditJson());
const blocked = [];

for (const [name, vuln] of Object.entries(audit.vulnerabilities ?? {})) {
  const severity = vuln.severity;
  if (severity !== 'high' && severity !== 'critical') continue;
  if (severity === 'high' && ALLOW_HIGH.has(name)) continue;
  blocked.push({ name, severity, title: vuln.via?.[0]?.title ?? severity });
}

if (blocked.length === 0) {
  console.log('Security audit OK (high/critical clear; xlsx high accepted with no npm fix).');
  process.exit(0);
}

console.error('Security audit failed — disallowed vulnerabilities:');
for (const v of blocked) {
  console.error(`  [${v.severity}] ${v.name}: ${v.title}`);
}
process.exit(1);
