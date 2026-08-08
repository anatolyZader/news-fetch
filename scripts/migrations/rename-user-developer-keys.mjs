#!/usr/bin/env node
/**
 * One-off migration for the operator→user / analyst→developer vocabulary cut.
 *
 * Renames JSON **keys** plus two enum-shaped values (`weights_steward` and
 * `display_view`) in persisted artifacts, textually, so file formatting is
 * preserved byte-for-byte outside the renamed tokens. Free text is never
 * touched: report narratives and captured social posts legitimately contain the
 * word "operator" in unrelated senses ("business operators", "daycare
 * operators"), and rewriting them would corrupt historical content.
 *
 * Markdown report renderings are deliberately left alone for the same reason.
 *
 * Usage: node scripts/migrations/rename-user-developer-keys.mjs [--apply]
 */
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const apply = process.argv.includes('--apply');

/** Persisted key names, old → new. */
const KEY_MAP = {
  analyst_flags: 'developer_flags',
  cross_component_synthesis_operator: 'cross_component_synthesis_user',
  evidence_operator: 'evidence_user',
  evidence_operator_structured: 'evidence_user_structured',
  narrative_operator: 'narrative_user',
  operator_accountability: 'user_accountability',
  operator_component_thin: 'user_component_thin',
  operator_display_state: 'user_display_state',
  operator_epistemic_role: 'user_epistemic_role',
  operator_evidence_tier: 'user_evidence_tier',
  operator_investigation_pool: 'user_investigation_pool',
  operator_investigation_pool_by_source: 'user_investigation_pool_by_source',
  operator_recommendations: 'user_recommendations',
  operator_shows_score: 'user_shows_score',
  operator_state_inputs: 'user_state_inputs',
  operator_state_reason: 'user_state_reason',
  operator_status: 'user_status',
  operator_surface_mode: 'user_surface_mode',
  operator_surface_starved: 'user_surface_starved',
  operator_view: 'user_view',
  operator_visibility: 'user_visibility',
  show_operator: 'show_user',
};

/** Longest first so `evidence_operator_structured` wins over `evidence_operator`. */
const KEYS = Object.keys(KEY_MAP).sort((a, b) => b.length - a.length);

/** `"<key>"` immediately followed by a colon, and not escaped inside a string. */
const keyRe = new RegExp(String.raw`(?<!\\)"(${KEYS.join('|')})"(?=\s*:)`, 'g');
/** Stewardship role recorded as a value. */
const valueRe = /(?<!\\)"analyst_and_product_review"/g;
/** Display-view enum recorded as a value on cached payloads. */
const displayViewRe = /("display_view"\s*:\s*)"(operator|analyst)"/g;
const DISPLAY_VIEW_MAP = { operator: 'user', analyst: 'developer' };

let renamedKeys = 0;
let renamedValues = 0;

/** @param {string} raw @returns {string} */
function convert(raw) {
  let out = raw.replaceAll(keyRe, (_m, k) => {
    renamedKeys += 1;
    return `"${KEY_MAP[k]}"`;
  });
  out = out.replaceAll(valueRe, () => {
    renamedValues += 1;
    return '"developer_and_product_review"';
  });
  out = out.replaceAll(displayViewRe, (_m, prefix, v) => {
    renamedValues += 1;
    return `${prefix}"${DISPLAY_VIEW_MAP[v]}"`;
  });
  return out;
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isSymbolicLink()) continue;
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      out.push(...walk(p));
    } else if (e.isFile() && (e.name.endsWith('.json') || e.name.endsWith('.jsonl'))) {
      if (p.includes('/data/')) out.push(p);
    }
  }
  return out;
}

const files = walk(join(ROOT, 'business_modules'));
let changedFiles = 0;

for (const p of files) {
  let raw;
  try {
    if (statSync(p).size > 200 * 1024 * 1024) continue;
    raw = readFileSync(p, 'utf8');
  } catch { continue; }
  if (!/analyst|operator/i.test(raw)) continue;
  const out = convert(raw);
  if (out === raw) continue;
  changedFiles += 1;
  if (apply) writeFileSync(p, out);
}

console.log(`apply=${apply} scanned=${files.length} filesChanged=${changedFiles} keysRenamed=${renamedKeys} valuesRenamed=${renamedValues}`);
