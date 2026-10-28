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
    // TB-37: the Sentry SDK is native + ESM; tests use a stub (the app only starts it with a DSN).
    '^@sentry/react-native$': '<rootDir>/src/lib/testing/sentry-stub.ts',
  },
  // Gesture-handler and bottom-sheet mocks for the design system primitives (TB-17).
  // Jest appends these to the jest-expo preset's own setupFiles.
  setupFiles: ['<rootDir>/src/components/ui/testing/jest-setup.ts'],
  // .claude/ holds Claude Code hook tooling with its own tests; supabase/ tests run via the Supabase CLI.
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/.claude/', '/supabase/'],
};
