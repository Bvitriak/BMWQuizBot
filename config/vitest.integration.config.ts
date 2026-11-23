import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    name: 'postgres',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: './tests/integration/setup.ts',
    fileParallelism: false,
    testTimeout: 10_000,
  },
});
