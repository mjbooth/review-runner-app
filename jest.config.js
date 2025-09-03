/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.test.ts',
    'src/tests/**/*.test.ts',
    'src/tests/**/*.test.tsx',
  ],

  // Coverage settings
  collectCoverage: false, // Disable for faster tests
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.d.ts',
    '!src/types/**/*',
    '!src/scripts/**/*',
    '!src/tests/**/*',
    '!coverage/**/*',
    '!node_modules/**/*',
  ],

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],

  // Transform settings
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },

  // Module name mapping for TypeScript path aliases
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },

  // Environment variables for testing
  testEnvironmentOptions: {
    NODE_ENV: 'test',
  },

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,

  // Timeout for tests
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Global teardown
  globalTeardown: '<rootDir>/tests/teardown.ts',
};
