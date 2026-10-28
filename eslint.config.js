// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Only src/db opens the local database; everything else goes through a repository (TB-21).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/db/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-sqlite',
              message: 'Open the DB only in src/db; use a repository in features/*/repo.',
            },
            {
              name: 'better-sqlite3',
              message: 'Open the DB only in src/db; use a repository in features/*/repo.',
            },
          ],
          patterns: [
            {
              group: ['drizzle-orm/expo-sqlite', 'drizzle-orm/expo-sqlite/*'],
              message: 'Open the DB only in src/db; use a repository in features/*/repo.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/*', '.expo/*', 'scripts/workflow/*'],
  },
]);
