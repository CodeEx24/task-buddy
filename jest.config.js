/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    // Keep in sync with tsconfig.json "paths" (more specific alias first).
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // .claude/ holds Claude Code hook tooling with its own tests; supabase/ tests run via the Supabase CLI.
  testPathIgnorePatterns: ['/node_modules/', '/.expo/', '/.claude/', '/supabase/'],
};
