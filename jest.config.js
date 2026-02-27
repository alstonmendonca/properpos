// ProperPOS Jest Configuration
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/backend', '<rootDir>/frontend'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/?(*.)+(spec|test).+(ts|tsx|js)',
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/coverage/**',
    '!**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  moduleNameMapper: {
    '^@properpos/shared$': '<rootDir>/shared/src',
    '^@properpos/backend-shared$': '<rootDir>/backend/shared/src',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  globalSetup: '<rootDir>/tests/global-setup.js',
  globalTeardown: '<rootDir>/tests/global-teardown.js',
  testTimeout: 30000,
  verbose: true,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/**/*.unit.test.ts'],
      testEnvironment: 'node',
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      moduleNameMapper: {
        '^@properpos/shared$': '<rootDir>/shared/src',
        '^@properpos/backend-shared$': '<rootDir>/backend/shared/src',
      },
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testMatch: ['<rootDir>/**/*.integration.test.ts'],
      testEnvironment: 'node',
      transform: { '^.+\\.tsx?$': 'ts-jest' },
      moduleNameMapper: {
        '^@properpos/shared$': '<rootDir>/shared/src',
        '^@properpos/backend-shared$': '<rootDir>/backend/shared/src',
      },
    },
  ],
};
