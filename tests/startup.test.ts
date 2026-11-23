import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('native TypeScript startup', () => {
  it.each(['', 'never-output-this-invalid-value'])(
    'fails without a valid token before initializing the Telegram client',
    (value) => {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL('../src/index.ts', import.meta.url))],
        {
          env: { ...process.env, BOT_MODE: 'polling', BOT_TOKEN: value },
          encoding: 'utf8',
          timeout: 5_000,
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('"event":"config_error"');
      expect(result.stderr).toContain('Check environment variables: BOT_TOKEN');
      expect(result.stderr).not.toContain('never-output-this-invalid-value');
    },
  );
});
