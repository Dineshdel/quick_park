/** API e2e tests against a real Postgres+PostGIS and Redis (see test/setup-env.ts). */
module.exports = {
  rootDir: '.',
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/setup-env.ts'],
  globalSetup: '<rootDir>/global-setup.ts',
  testTimeout: 30000,
};
