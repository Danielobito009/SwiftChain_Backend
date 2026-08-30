/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    // Disable ts-jest type-checking diagnostics so pre-existing type errors in
    // unrelated source files do not block the test runner.
    // Type safety is still enforced separately by `pnpm run build` (tsc).
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: false }],
  },
  setupFiles: ['<rootDir>/tests/jest.setup.ts'],
  // Allow enough time for MongoMemoryServer to start (and download the binary
  // on first run in a fresh environment).
  testTimeout: 30000,
};
