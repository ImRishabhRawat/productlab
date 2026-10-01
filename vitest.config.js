import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.js', 'backend/test/**/*.test.js'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
      ADMIN_EMAIL: 'admin@test.local',
      ADMIN_PASSWORD: 'test-password',
    },
  },
});
