import { defineConfig } from 'vitest/config';

const databaseUrl = process.env.INTEGRATION_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('INTEGRATION_DATABASE_URL is required for integration tests.');
}
if (!new URL(databaseUrl).pathname.endsWith('_test')) {
  throw new Error('Integration tests delete fixtures and require a dedicated database whose name ends with _test.');
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.integration.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    restoreMocks: true,
    clearMocks: true,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      APP_ORIGIN: 'http://localhost:5173',
      LOG_LEVEL: process.env.LOG_LEVEL ?? 'silent',
      SESSION_TTL_HOURS: '12',
      PASSWORD_RESET_TTL_MINUTES: '60',
    },
  },
});
