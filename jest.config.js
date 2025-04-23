module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  testMatch: [
    '**/test/**/*.test.ts',
    '**/src/test/**/*.test.ts'
  ],
  coverageReporters: ['json', 'lcov', 'text', 'cobertura'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/test/**/*.ts'
  ],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json'
    }
  },
  // Mock VS Code's API
  moduleNameMapper: {
    'vscode': '<rootDir>/src/test/vscode-mock.ts'
  },
  // Set up test environment
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.js'],
  testRunner: 'jest-circus/runner'
}; 