import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';

/** Plugins for SonarCloud-aligned lint rules (shared by eslint.config.js). */
export const sonarProfilePlugins = {
  sonarjs,
  unicorn,
};

/** Curated rules matching SonarCloud / IDE panel for this project. */
export const sonarProfileRules = {
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
};
