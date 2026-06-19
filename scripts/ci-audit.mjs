#!/usr/bin/env node
/**
 * CI security audit: fail on high/critical except documented dependency exceptions.
 * DevDependencies are omitted — openapi lint toolchain (@redocly/cli) is not runtime.
 */
import { execSync } from 'node:child_process';

/**
 * High severity accepted until npm fix or min-release-age allows a patched release.
 * - xlsx: no upstream fix
 * - form-data, protobufjs: fixes exist but are newer than supply-chain min-release-age window
 */
const ALLOW_HIGH = new Set(['xlsx', 'form-data', 'protobufjs']);

function loadAuditJson() {
  try {
    return execSync('npm audit --omit=dev --json', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
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
  console.log('Security audit OK (production high/critical clear; documented exceptions: xlsx, form-data, protobufjs).');
  process.exit(0);
}

console.error('Security audit failed — disallowed vulnerabilities:');
for (const v of blocked) {
  console.error(`  [${v.severity}] ${v.name}: ${v.title}`);
}
process.exit(1);
