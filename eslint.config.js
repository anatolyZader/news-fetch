import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { reactPropTypesPlugin } from './eslint-rules/reactPropTypes.js';
import { sonarProfilePlugins, sonarProfileRules } from './eslint-rules/sonarProfile.js';

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      'client/node_modules/**',
      'client/dist/**',
      'tools/docs-site/**',
      'analyst-site/**',
      'dist/**',
      '.cursor/**',
      '**/*.min.js',
      'articles_extracted/**',
      'business_modules/resilience_scorer/data/**',
      'business_modules/specialist_agents/data/**',
      'business_modules/resilience_scorer/analyst/data/**',
      'signals/**',
      'cross-cut-modules/docs/content/pages/api/generated/**',
      'business_modules/**/data/**',
      'tests/fixtures/**',
      'test-results/**',
      'logs/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['business_modules/**/*.{js,mjs,cjs}'],
    ignores: ['business_modules/**/index.js', 'tests/**', 'scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/business_modules/*/app/**',
                '**/business_modules/*/domain/**',
                '**/business_modules/*/infrastructure/**',
                '**/business_modules/*/input/**',
                '**/business_modules/*/validation/**',
                '**/business_modules/*/tuning/**',
              ],
              message:
                'Import other business modules only via their index.js facade (e.g. business_modules/foo/index.js).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    plugins: sonarProfilePlugins,
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      ...sonarProfileRules,
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Option B: input/ is transport-only — delegate to app/ or index.js (not own domain/ or infrastructure/).
    files: ['business_modules/**/input/**/*.{js,mjs,cjs}'],
    ignores: ['tests/**', 'scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/business_modules/*/domain/**', '**/business_modules/*/infrastructure/**'],
              message:
                'Option B: input/ may only import own app/ or index.js — move logic to an app service or CLI runner.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ignores: ['cross-cut-modules/llm/**', '**/infrastructure/**', 'tests/**', 'scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@anthropic-ai/sdk',
              message:
                'Import LLM access via cross-cut-modules/llm (ILlmPort) or infrastructure adapters only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/domain/**/*.{js,mjs,cjs}'],
    ignores: [
      '**/infrastructure/**',
      'tests/**',
      'scripts/**',
      'cross-cut-modules/persistence/**',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:fs',
              message: 'Domain layer must use cross-cut-modules/persistence ports, not node:fs directly.',
            },
            {
              name: 'fs',
              message: 'Domain layer must use cross-cut-modules/persistence ports, not fs directly.',
            },
          ],
          patterns: [
            {
              group: ['**/infrastructure/**', '**/app/**'],
              message: 'Domain layer must not import from infrastructure or app layers.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      local: reactPropTypesPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'local/prop-types': 'error',
    },
  },
]);
