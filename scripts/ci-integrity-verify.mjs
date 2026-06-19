#!/usr/bin/env node
/**
 * CI / cron: compare current integrity manifest against committed baseline.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildIntegrityManifest,
  compareIntegrityManifestRecords,
  clientDistExists,
} from '../cross-cut-modules/security/app/integrityManifest.js';
import { notifySecurityEvent } from '../cross-cut-modules/security/app/securityNotifier.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'security/integrity-baseline.json');

async function main() {
  if (!existsSync(BASELINE_PATH)) {
    console.error(`Missing baseline: ${BASELINE_PATH}`);
    console.error('Run: npm run security:integrity:record (after npm ci && npm run client:build)');
    console.error('Or trigger GitHub Actions workflow "Record integrity baseline" and commit the artifact.');
    process.exit(1);
  }

  if (!clientDistExists(ROOT)) {
    console.error('client/dist not found — run npm run client:build before integrity verify');
    process.exit(1);
  }

  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  const current = await buildIntegrityManifest({
    rootDir: ROOT,
    includeClientDist: true,
    gitSha: process.env.GITHUB_SHA ?? null,
  });

  const comparison = compareIntegrityManifestRecords(baseline, current);

  if (comparison.ok) {
    console.log(`Integrity verify OK (${Object.keys(current.files).length} files match baseline).`);
    await notifySecurityEvent({
      tier: 'info',
      action: 'integrity.verify.ok',
      summary: `${Object.keys(current.files).length} files match baseline`,
      meta: { fileCount: Object.keys(current.files).length },
    });
    return;
  }

  const driftSummary = comparison.drifts
    .slice(0, 10)
    .map((d) => `${d.path}: expected ${d.expected?.slice(0, 8) ?? 'missing'}… actual ${d.actual?.slice(0, 8) ?? 'missing'}…`)
    .join('; ');

  await notifySecurityEvent({
    tier: 'critical',
    action: 'integrity.drift',
    summary: `${comparison.drifts.length} file(s) drifted from baseline`,
    meta: { drifts: comparison.drifts.slice(0, 20), total: comparison.drifts.length },
  });

  console.error('Integrity verify FAILED — drifts detected:');
  for (const drift of comparison.drifts.slice(0, 30)) {
    console.error(`  ${drift.path}`);
  }
  if (comparison.drifts.length > 30) {
    console.error(`  … and ${comparison.drifts.length - 30} more`);
  }
  console.error(`Summary: ${driftSummary}`);
  console.error('If intentional, run workflow "Record integrity baseline" on GitHub Actions (canonical CI build), or locally: npm run security:integrity:record && commit security/integrity-baseline.json');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
