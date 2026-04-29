module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    modulePathIgnorePatterns: [
      '<rootDir>/.data',
      '<rootDir>/.data-build',
      '<rootDir>/.data.stale-*',
      '<rootDir>/.next',
      '<rootDir>/next-build',
      '<rootDir>/.venv',
      '<rootDir>/SofascoreData/.venv',
      '<rootDir>/SofascoreData/data',
      '<rootDir>/SofascoreData/reports',
    ],
    testPathIgnorePatterns: [
      '<rootDir>/.data',
      '<rootDir>/.data-build',
      '<rootDir>/.data.stale-*',
      '<rootDir>/.next',
      '<rootDir>/next-build',
      '<rootDir>/.venv',
      '<rootDir>/SofascoreData/.venv',
    ],
    watchPathIgnorePatterns: [
      '<rootDir>/.data',
      '<rootDir>/.data-build',
      '<rootDir>/.data.stale-*',
      '<rootDir>/.next',
      '<rootDir>/next-build',
      '<rootDir>/.venv',
      '<rootDir>/SofascoreData/.venv',
    ],
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
    },
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/$1',
      '^server-only$': '<rootDir>/__mocks__/server-only.js'
    }
  }