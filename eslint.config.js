import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { reactPropTypesPlugin } from './eslint-rules/reactPropTypes.js';

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      'client/node_modules/**',
      'client/dist/**',
      'docs/docs-site/**',
      'analyst-site/**',
      'dist/**',
      '.cursor/**',
      '**/*.min.js',
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
    files: ['**/*.{js,mjs,cjs}'],
    ignores: ['business_modules/geo/**', 'tests/**', 'scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/geo/domain/**',
                '**/geo/app/**',
                '**/geo/infrastructure/**',
              ],
              message:
                'Import geo capabilities from business_modules/geo/index.js (the module facade), not its internals.',
            },
          ],
        },
      ],
    },
  },
  {
    // Cross-module boundary: sibling modules must import resilience capabilities
    // from its facade (business_modules/resilience/index.js), not reach into its
    // internals. Scoped out for the resilience module itself. Warn during the
    // GRASP migration — error once all §3 markers are resolved.
    files: ['**/*.{js,mjs,cjs}'],
    ignores: ['business_modules/resilience/**', 'tests/**', 'scripts/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/resilience/domain/**',
                '**/resilience/app/**',
                '**/resilience/infrastructure/**',
                '**/resilience/validation/**',
              ],
              message:
                'Import resilience capabilities from business_modules/resilience/index.js (the module facade), not its internals.',
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
    ignores: ['**/infrastructure/**', 'tests/**', 'scripts/**'],
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
