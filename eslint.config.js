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
