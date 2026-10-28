/** @type {import('jest').Config} */
const app = {
  displayName: 'app',
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
  // .claude/ holds Claude Code hook tooling with its own tests; supabase/ tests run via the Supabase
  // CLI (SQL) or the edge-functions project below.
  // TB-20: *.integration.test.ts need a local Supabase stack; they run with jest.integration.config.js.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.expo/',
    '/.claude/',
    '/supabase/',
    '\.integration\.test\.ts$',
  ],
};

// TB-22: Edge Function unit tests. Plain Node environment (web-standard fetch/Request/Response),
// without the jest-expo preset, whose React Native globals don't belong in server code.
const edgeFunctions = {
  displayName: 'edge-functions',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/supabase/functions/**/*.test.ts'],
  transform: { '\\.[jt]sx?$': 'babel-jest' },
};

module.exports = { projects: [app, edgeFunctions] };
