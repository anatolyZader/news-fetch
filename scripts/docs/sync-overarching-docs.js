/**
 * Regenerate auto-synced sections in docs/main_docu_files/ and OpenAPI-derived product docs.
 * Run: npm run docs:sync
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { RESILIENCE_COMPONENTS } from '../../business_modules/resilience/domain/resilienceComponents.js';
import { COMPONENT_FACETS } from '../../business_modules/resilience/domain/services/componentFacets.js';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const REPO_ROOT = resolve(__dirname, '../..');
const MAIN_DOCU_DIR = resolve(REPO_ROOT, 'docs/main_docu_files');
const EIGHT_COMPONENT_DOC = resolve(MAIN_DOCU_DIR, '8-component-analysis-end-to-end.md');
const TRANSLATIONS_PATH = resolve(REPO_ROOT, 'client/src/i18n/translations.js');

const SYNC_NOTE = (source) =>
  `> **Auto-synced** from \`${source}\` on ${new Date().toISOString().slice(0, 10)}. Do not edit between sync markers.\n`;

function replaceRegion(content, regionId, body) {
  const begin = `<!-- docs-sync:BEGIN ${regionId} -->`;
  const end = `<!-- docs-sync:END ${regionId} -->`;
  const pattern = new RegExp(
    `${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`,
    'm',
  );
  if (!pattern.test(content)) {
    throw new Error(`Missing sync region "${regionId}" in ${EIGHT_COMPONENT_DOC}`);
  }
  return content.replace(pattern, `${begin}\n\n${body.trim()}\n\n${end}`);
}

function escapeRegExp(s) {
  return s.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function oneLineSummary(description) {
  const text = String(description ?? '').replaceAll(/\s+/g, ' ').trim();
  if (!text) return '';
  const end = text.search(/[.!?](\s|$)/);
  return end === -1 ? text.slice(0, 160) : text.slice(0, end + 1);
}

function formatFacetCell(facets) {
  return Object.keys(facets)
    .map((f) => `\`${f}\``)
    .join(', ');
}

function formatSignalTypes(facets) {
  const types = new Set();
  for (const list of Object.values(facets)) {
    for (const t of list) types.add(t);
  }
  return [...types].sort((a, b) => a.localeCompare(b)).map((t) => `\`${t}\``).join(', ');
}

async function loadUiLabels() {
  const raw = await readFile(TRANSLATIONS_PATH, 'utf8');
  const en = {};
  const he = {};
  const enBlock = raw.match(/en:\s*\{([\s\S]*?)\n\s*he:\s*\{/);
  const heBlock = raw.match(/he:\s*\{([\s\S]*?)\n\s*ru:\s*\{/);
  const parseBlock = (block, out) => {
    if (!block) return;
    for (const m of block[1].matchAll(/'comp\.([^']+)':\s*'([^']*)'/g)) {
      out[m[1]] = m[2];
    }
  };
  parseBlock(enBlock, en);
  parseBlock(heBlock, he);
  return { en, he };
}

function generateAtAGlanceTable() {
  const lines = [
    SYNC_NOTE('business_modules/resilience/domain/resilienceComponents.js'),
    '| # | ID | English | Hebrew | What it measures (in one line) |',
    '|---|---|---|---|---|',
  ];
  RESILIENCE_COMPONENTS.forEach((c, i) => {
    lines.push(
      `| ${i + 1} | \`${c.id}\` | ${c.name_en} | ${c.name_he} | ${oneLineSummary(c.description)} |`,
    );
  });
  return lines.join('\n');
}

function generateFacetTable() {
  const lines = [
    SYNC_NOTE('business_modules/resilience/domain/services/componentFacets.js'),
    '| Component | Facets |',
    '|---|---|',
  ];
  for (const c of RESILIENCE_COMPONENTS) {
    const facets = COMPONENT_FACETS[c.id];
    const cell = facets ? formatFacetCell(facets) : '—';
    lines.push(`| \`${c.id}\` | ${cell} |`);
  }
  return lines.join('\n');
}

function generateComponentDetailSections() {
  const parts = [
    SYNC_NOTE('resilienceComponents.js + componentFacets.js'),
    '',
    'Per-component reference below is regenerated from code. Extended narrative, signal-routing notes, and boundary rules in earlier manual sections may appear in pipeline stages §3+.',
  ];

  RESILIENCE_COMPONENTS.forEach((c, i) => {
    const section = i + 2;
    parts.push('', `### 2.${section} \`${c.id}\` — ${c.name_en} (${c.name_he})`, '');
    parts.push(`**What it measures:** ${c.description.trim()}`);
    if (c.principle) {
      parts.push('');
      parts.push(`**Principle:** ${c.principle.trim()}`);
    }
    if (c.key_elements?.length) {
      parts.push('', '**Key elements:**');
      for (const el of c.key_elements) parts.push(`- ${el}`);
    }
    if (c.guiding_questions?.length) {
      parts.push('', '**Guiding questions (from `RESILIENCE_COMPONENTS`):**');
      for (const q of c.guiding_questions) parts.push(`- ${q}`);
    }
    if (c.behavioral_manifestations?.length) {
      parts.push('', '**Behavioral manifestations (from code):**');
      for (const m of c.behavioral_manifestations) parts.push(`- ${m}`);
    }
    const facets = COMPONENT_FACETS[c.id];
    if (facets) {
      parts.push('', '**Facets and signal types (from `componentFacets.js`):**', '', '| Facet | Signal types |', '|---|---|');
      for (const [facetId, signals] of Object.entries(facets)) {
        const sigCell = signals.map((s) => `\`${s}\``).join(', ');
        parts.push(`| \`${facetId}\` | ${sigCell} |`);
      }
      parts.push('');
      parts.push(`**All facet signal types for this component:** ${formatSignalTypes(facets)}`);
    }
    parts.push('', '---');
  });

  return parts.join('\n');
}

function generateAppendixUiLabels(en, he) {
  const lines = [
    SYNC_NOTE('client/src/i18n/translations.js (en + he)'),
    '| ID | English UI label | Hebrew UI label |',
    '|---|---|---|',
  ];
  for (const c of RESILIENCE_COMPONENTS) {
    const enLabel = en[c.id] ?? c.name_en;
    const heLabel = he[c.id] ?? c.name_he;
    lines.push(`| \`${c.id}\` | ${enLabel} | ${heLabel} |`);
  }
  return lines.join('\n');
}

function ensureSyncMarkers(content) {
  if (content.includes('docs-sync:BEGIN components-at-a-glance')) return content;

  content = content.replace(
    /(### 2\.0 At-a-glance table\n\n)\|[\s\S]*?\n\n(### 2\.1 Per-component facet decomposition)/m,
    `$1<!-- docs-sync:BEGIN components-at-a-glance -->\n\n<!-- docs-sync:END components-at-a-glance -->\n\n$2`,
  );

  content = content.replace(
    /(facet drift\.\n\n)(\| Component \| Facets \|[\s\S]*?\n\n)(Every signal type listed)/m,
    `$1<!-- docs-sync:BEGIN component-facets -->\n\n<!-- docs-sync:END component-facets -->\n\n$3`,
  );

  content = content.replace(
    /(Every signal type listed in a facet must route into its parent component via `SIGNAL_TO_COMPONENTS` \(enforced by a unit test\)\.\n\n)---\n\n### 2\.2[\s\S]*?\n\n---\n\n(## 3\) Architecture at a glance)/m,
    `$1<!-- docs-sync:BEGIN components-detail -->\n\n<!-- docs-sync:END components-detail -->\n\n$2`,
  );

  content = content.replace(
    /(Stable IDs \(used in JSON, code, and i18n keys\) and their English labels from `client\/src\/i18n\/translations\.js`:\n\n)(\| ID \| English UI label[\s\S]*?\n\n)(Hebrew UI strings are defined)/m,
    `$1<!-- docs-sync:BEGIN appendix-ui-labels -->\n\n<!-- docs-sync:END appendix-ui-labels -->\n\n$3`,
  );

  return content;
}

async function syncEightComponentDoc() {
  let content = await readFile(EIGHT_COMPONENT_DOC, 'utf8');
  content = ensureSyncMarkers(content);

  const { en, he } = await loadUiLabels();
  content = replaceRegion(content, 'components-at-a-glance', generateAtAGlanceTable());
  content = replaceRegion(content, 'component-facets', generateFacetTable());
  content = replaceRegion(content, 'components-detail', generateComponentDetailSections());
  content = replaceRegion(content, 'appendix-ui-labels', generateAppendixUiLabels(en, he));

  await writeFile(EIGHT_COMPONENT_DOC, content, 'utf8');
  console.log(`Synced ${relativePath(EIGHT_COMPONENT_DOC)}`);
}

function relativePath(abs) {
  return abs.startsWith(REPO_ROOT) ? abs.slice(REPO_ROOT.length + 1) : abs;
}

function runGenApi() {
  const result = spawnSync('npm', ['run', 'gen:api', '--prefix', 'docs-site'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      'docs-site gen:api failed (run: npm ci --prefix docs-site)',
    );
  }
  console.log('Regenerated product_docs/api/generated from openapi/openapi.yaml');
}

async function main() {
  await syncEightComponentDoc();
  runGenApi();
  console.log('docs:sync complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
