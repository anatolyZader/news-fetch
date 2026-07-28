#!/usr/bin/env node
/**
 * Dump a slim JSON snapshot of the signal catalog + routing for the
 * catalog-harvest pipeline (agent prompts and the dedup judge read this
 * instead of the full 2100-line signalCatalog.js).
 *
 * Usage: node scripts/catalog-harvest/dump-catalog-snapshot.mjs [--out <path>] [--compact]
 *   --compact  types as one-line strings (type | domain | polarity | label) —
 *              smallest form, for fan-out agent prompts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  CATALOG_VERSION,
  SIGNAL_CATALOG,
  SIGNAL_DOMAINS,
  SIGNAL_ALIASES,
  CONSTRUCT_ROLES,
} from '../../business_modules/resilience_scorer/domain/contracts/signalCatalog.js';
import { SIGNAL_TO_COMPONENTS } from '../../business_modules/resilience_scorer/domain/services/signals/routing/signalRouting.js';
import { COMPONENT_IDS } from '../../business_modules/resilience_scorer/domain/contracts/componentIds.js';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outPath = outIdx !== -1 ? args[outIdx + 1] : null;
const compact = args.includes('--compact');

const toCompactLine = (e) =>
  `${e.type} | ${e.domain} | ${e.defaultPolarity} | ${e.construct_role} | ${e.label}`;

const toFullEntry = (e) => ({
  type: e.type,
  label: e.label,
  domain: e.domain,
  signal_class: e.signal_class,
  defaultPolarity: e.defaultPolarity,
  construct_role: e.construct_role,
  ...(e.mirror ? { mirror: e.mirror } : {}),
  ...(e.related ? { related: e.related } : {}),
  ...(e.disambiguation ? { disambiguation: e.disambiguation } : {}),
  ...(e.example_evidence ? { example_evidence: e.example_evidence } : {}),
  routing: SIGNAL_TO_COMPONENTS[e.type] ?? null,
});

const types = SIGNAL_CATALOG.map(compact ? toCompactLine : toFullEntry);

const out = {
  catalog_version: CATALOG_VERSION,
  type_count: SIGNAL_CATALOG.length,
  domains: SIGNAL_DOMAINS,
  construct_roles: CONSTRUCT_ROLES,
  component_ids: COMPONENT_IDS,
  aliases: SIGNAL_ALIASES,
  types,
};

const json = JSON.stringify(out, null, compact ? 0 : 2);
if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, json);
  console.error(`Wrote ${outPath} (${out.type_count} types, catalog ${out.catalog_version})`);
} else {
  console.log(json);
}
