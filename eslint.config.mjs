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
    'sql/**/*.mjs',
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
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
