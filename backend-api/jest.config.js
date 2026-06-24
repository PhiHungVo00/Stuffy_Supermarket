/**
 * Jest configuration for backend-api.
 *
 * - Uses ts-jest to run TypeScript tests directly.
 * - isolatedModules (transpile-only) mirrors the dev workflow
 *   (`ts-node-dev --transpile-only`) so cross-file strict type
 *   errors in the existing codebase don't block test runs.
 * - testTimeout is large because tests boot a MongoDB replica set
 *   (mongodb-memory-server) and exercise multi-document transactions.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Only pick up *.test.ts files; helpers/seed live in __tests__/helpers.
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  // Replica-set boot + transaction retries need generous time.
  testTimeout: 120000,
  setupFiles: ['<rootDir>/__tests__/jest.setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  // The app's redis.ts opens an ioredis connection on import (transitively via
  // models). Tests that don't mock it leave that handle open, so force exit
  // once the run completes to avoid hanging the process.
  forceExit: true,
  detectOpenHandles: false,
  clearMocks: true,
};
