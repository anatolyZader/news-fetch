/**
 * Bidirectional map: Sonar rule keys (javascript:Sxxxx) ↔ ESLint rule ids.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Sonar rules → eslint rule ids (may be multiple). */
/** @type {Record<string, string[]>} */
export const SONAR_TO_ESLINT = {
  'javascript:S3776': ['sonarjs/cognitive-complexity'],
  'javascript:S2004': ['sonarjs/no-nested-functions'],
  'javascript:S3735': ['sonarjs/void-use'],
  'javascript:S3358': ['sonarjs/no-nested-conditional'],
  'javascript:S4624': ['sonarjs/no-nested-template-literals'],
  'javascript:S101': ['sonarjs/class-name'],
  'javascript:S4043': ['sonarjs/no-misleading-array-reverse'],
  'javascript:S6774': ['local/prop-types'],
  'javascript:S7748': ['unicorn/no-zero-fractions'],
  'javascript:S7721': ['unicorn/consistent-function-scoping'],
  'javascript:S7763': ['unicorn/prefer-export-from'],
  'javascript:S7734': ['unicorn/no-named-default'],
  'javascript:S7735': ['unicorn/no-negated-condition'],
  'javascript:S7781': ['unicorn/prefer-string-replace-all'],
  'javascript:S7778': ['unicorn/prefer-single-call'],
  'javascript:S7770': ['unicorn/prefer-native-coercion-functions'],
  'javascript:S7773': ['unicorn/prefer-number-properties'],
  'javascript:S7744': ['unicorn/no-useless-fallback-in-spread'],
  'javascript:S1126': ['sonarjs/prefer-single-boolean-return'],
  'javascript:S5843': ['sonarjs/regex-complexity'],
  'javascript:S5869': ['sonarjs/duplicates-in-character-class'],
  'javascript:S6557': ['unicorn/prefer-string-starts-ends-with'],
};

/** @type {Record<string, string> | null} */
let eslintToSonarCached = null;

/**
 * Build eslint id → sonar key from sonarjs README + SONAR_TO_ESLINT.
 * @returns {Record<string, string>}
 */
export function eslintRuleToSonarKey() {
  if (eslintToSonarCached) return eslintToSonarCached;

  /** @type {Record<string, string>} */
  const map = {};
  for (const [sonar, eslintIds] of Object.entries(SONAR_TO_ESLINT)) {
    for (const id of eslintIds) {
      map[id] = sonar;
    }
  }

  try {
    const md = readFileSync(
      resolve(__dirname, '../node_modules/eslint-plugin-sonarjs/README.md'),
      'utf8',
    );
    const sonarjsRe = /\| \[([^\]]+)\].*?rspec\/S(\d+)\/javascript\)/g;
    for (let m = sonarjsRe.exec(md); m; m = sonarjsRe.exec(md)) {
      map[`sonarjs/${m[1]}`] = `javascript:S${m[2]}`;
    }
    const unicornRe = /\| S(\d+)\s+\|\s+\[unicorn\/([^\]]+)\]/g;
    for (let m = unicornRe.exec(md); m; m = unicornRe.exec(md)) {
      map[`unicorn/${m[2]}`] = `javascript:S${m[1]}`;
    }
  } catch {
    // sonarjs not installed
  }

  eslintToSonarCached = map;
  return map;
}

/**
 * @param {string} eslintRuleId
 * @returns {string}
 */
export function toSonarRule(eslintRuleId) {
  return eslintRuleToSonarKey()[eslintRuleId] ?? eslintRuleId;
}

/**
 * @param {string} sonarRule e.g. javascript:S3776
 * @returns {string[]}
 */
export function eslintRulesForSonar(sonarRule) {
  if (SONAR_TO_ESLINT[sonarRule]?.length) {
    return SONAR_TO_ESLINT[sonarRule];
  }
  const reverse = eslintRuleToSonarKey();
  return Object.entries(reverse)
    .filter(([, sonar]) => sonar === sonarRule)
    .map(([eslintId]) => eslintId);
}

/** Curated eslint rules enabled in eslint.sonar.config.js (profile-aligned). */
export const PROFILE_ESLINT_RULES = [
  ...new Set(Object.values(SONAR_TO_ESLINT).flat()),
];
