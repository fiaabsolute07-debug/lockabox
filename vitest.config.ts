import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// DB suites run against an isolated database (prepare with `pnpm db:test:prepare`), never the dev database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:local_dev_only@127.0.0.1:55442/lockabox_test';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    env: { DATABASE_URL: testDatabaseUrl },
  },
});
