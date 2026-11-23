import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    projects: [
      './config/vitest.config.ts',
      './config/vitest.integration.config.ts',
    ],
    coverage: { include: ['src/**/*.ts'], reporter: ['text', 'lcov'] },
  },
});
