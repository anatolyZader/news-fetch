/**
 * Profile-aligned ESLint for /fix-sonar verification (not full sonarjs recommended).
 * Only rules that appear in SonarCloud / IDE panel for this project.
 */

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { reactPropTypesPlugin } from './eslint-rules/reactPropTypes.js';

export default defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      'client/node_modules/**',
      'client/dist/**',
      'docs-site/**',
      'dist/**',
      '.cursor/**',
      '**/*.min.js',
      'articles_extracted/**',
      'reports/**',
      'signals/**',
      'product_docs/api/generated/**',
      'business_modules/**/data/**',
      'tests/fixtures/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    plugins: {
      sonarjs,
      unicorn,
    },
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
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-nested-functions': 'error',
      'sonarjs/void-use': 'error',
      'sonarjs/no-nested-conditional': 'error',
      'sonarjs/no-nested-template-literals': 'error',
      'sonarjs/class-name': 'error',
      'sonarjs/no-misleading-array-reverse': 'error',
      'sonarjs/prefer-single-boolean-return': 'error',
      'sonarjs/regex-complexity': 'error',
      'sonarjs/duplicates-in-character-class': 'error',
      'unicorn/no-zero-fractions': 'error',
      'unicorn/consistent-function-scoping': 'error',
      'unicorn/prefer-export-from': 'error',
      'unicorn/no-named-default': 'error',
      'unicorn/no-negated-condition': 'error',
      'unicorn/prefer-string-replace-all': 'error',
      'unicorn/prefer-single-call': 'error',
      'unicorn/prefer-native-coercion-functions': 'error',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/no-useless-fallback-in-spread': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
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
