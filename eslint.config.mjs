import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores([
    '.features-gen/**',
    'reports/**',
    'node_modules/**',
    '.playwright-cli/**',
    '.claude/**',
  ]),
  js.configs.recommended,
  // Type-aware rules: catch floating promises (a missing `await` on a Playwright call is the most
  // common silent bug in step code) and misused promises.
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['src/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      // Playwright fixtures require an object-destructuring first arg, even when empty: ({}, use) => ...
      'no-empty-pattern': 'off',
      // In playwright-bdd, expect() lives inside step functions, not inside test() blocks.
      'playwright/no-standalone-expect': 'off',
      'playwright/no-networkidle': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/prefer-web-first-assertions': 'error',
      'playwright/no-force-option': 'error',
    },
  },
  prettier,
]);
