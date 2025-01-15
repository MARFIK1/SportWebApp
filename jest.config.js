module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/$1',
      '^server-only$': '<rootDir>/__mocks__/server-only.js'
    }
  }