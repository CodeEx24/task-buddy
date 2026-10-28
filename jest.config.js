/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // TB-21: tests run the DB on better-sqlite3 (Node) instead of expo-sqlite (native).
    '^@/db/client$': '<rootDir>/src/db/node-client.ts',
    // Keep in sync with tsconfig.json "paths" (more specific alias first).
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // NativeWind's global.css is compiled by Metro; Jest only needs the import to resolve (TB-17).
    '\\.css$': '<rootDir>/src/components/ui/testing/css-stub.ts',
  },
  // Gesture-handler and bottom-sheet mocks for the design system primitives (TB-17).
  // TB-20: the in-memory auth fake (starts signed in) in place of supabase-js auth.
  // Jest appends these to the jest-expo preset's own setupFiles.
  setupFiles: [
    '<rootDir>/src/components/ui/testing/jest-setup.ts',
    '<rootDir>/src/features/auth/testing/jest-setup.ts',
  ],
  // .claude/ holds Claude Code hook tooling with its own tests; supabase/ tests run via the Supabase CLI.
  // TB-20: *.integration.test.ts need a local Supabase stack; they run with jest.integration.config.js.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.expo/',
    '/.claude/',
    '/supabase/',
    '\.integration\.test\.ts$',
  ],
};
