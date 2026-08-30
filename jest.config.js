/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    ...tsJestTransformCfg,
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        ...tsJestTransformCfg['^.+\\.tsx?$'][1],
        isolatedModules: true,
      },
    ],
  },
  setupFiles: ['<rootDir>/tests/jest.setup.ts'],
  // Allow enough time for MongoMemoryServer to start (and download the binary
  // on first run in a fresh environment).
  testTimeout: 30000,
  // Exclude the compiled output directory — tests should only run from source.
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
