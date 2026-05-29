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
      'docs-site/**',
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
