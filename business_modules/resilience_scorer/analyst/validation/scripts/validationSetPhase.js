#!/usr/bin/env node
/**
 * Set operational_phase for crisis validation collection (manual authoritative trigger).
 *
 * Usage:
 *   npm run validation:set-phase -- elevated
 *   npm run validation:set-phase -- acute --note "Northern escalation"
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import {
  DEFAULT_VALIDATION_CONFIG,
  OPERATIONAL_PHASES,
  defaultValidationConfigPath,
  loadValidationConfig,
} from '../config/validationConfig.js';
import { createValidationArtifactWriter } from '../infrastructure/validationArtifactAdapter.js';

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

function main() {
  const phaseArg = process.argv[2];
  const note = getArg('--note') ?? null;

  if (!phaseArg || !OPERATIONAL_PHASES.includes(phaseArg)) {
    console.error(`Usage: validation-set-phase <${OPERATIONAL_PHASES.join('|')}> [--note "reason"]`);
    process.exit(1);
  }

  const configPath = defaultValidationConfigPath();
  const previous = loadValidationConfig(configPath);
  const now = new Date().toISOString();

  const next = {
    ...DEFAULT_VALIDATION_CONFIG,
    ...JSON.parse(existsSync(configPath) ? readFileSync(configPath, 'utf8') : '{}'),
    operational_phase: phaseArg,
    phase_started_at: phaseArg === 'baseline' ? null : now,
  };

  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

  const writer = createValidationArtifactWriter({ config: next });
  writer.appendPhaseLog({
    at: now,
    previous_phase: previous.operational_phase,
    new_phase: phaseArg,
    note,
    config_path: configPath,
  });

  console.log(JSON.stringify({
    config_path: configPath,
    previous_phase: previous.operational_phase,
    operational_phase: phaseArg,
    phase_started_at: next.phase_started_at,
    phase_log: writer.paths.phaseLog,
  }, null, 2));
}

main();
