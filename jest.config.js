module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
      '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }]
    },
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/$1',
      '^server-only$': '<rootDir>/__mocks__/server-only.js'
    }
  }