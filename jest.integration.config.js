// TB-20: integration tests against a local Supabase stack (CI job `auth`). Plain Node environment
// so `fetch` is Node's real one (the jest-expo preset stubs it), and none of the React Native
// setup files. Unit tests use jest.config.js.
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.integration.test.ts'],
  transform: { '\.[jt]sx?$': 'babel-jest' },
  // supabase-js and expo packages ship modern JS that babel must transform.
  transformIgnorePatterns: ['/node_modules/(?!(\.pnpm/)?(expo|@expo|expo-[^/]+|react-native)[/@])'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
