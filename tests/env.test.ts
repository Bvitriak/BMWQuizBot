import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.ts';

const BOT_TOKEN = `10000:${'x'.repeat(35)}`;
const WEBHOOK_SECRET = 'y'.repeat(43);
const DATABASE_URL = 'postgresql://test@localhost/fixture';
const base = { BOT_TOKEN, DATABASE_URL };

describe('environment', () => {
  it('defaults to polling and reports only the name of an invalid variable', () => {
    expect(loadEnv(base).BOT_MODE).toBe('polling');
    expect(() => loadEnv({ ...base, BOT_TOKEN: 'do-not-log-me' })).toThrow(
      'Check environment variables: BOT_TOKEN',
    );
    expect(() => loadEnv({ ...base, RATE_LIMIT_MAX_USERS: '1e5' })).toThrow(
      'RATE_LIMIT_MAX_USERS',
    );
    expect(() =>
      loadEnv({ ...base, DATABASE_URL: 'https://example.org/db' }),
    ).toThrow('DATABASE_URL');
  });

  it('requires HTTPS, the exact webhook path and a secret in webhook mode', () => {
    const BOT_MODE = 'webhook';
    const WEBHOOK_URL = 'https://bot.example.com/telegram';
    expect(
      loadEnv({ ...base, BOT_MODE, WEBHOOK_URL, WEBHOOK_SECRET }),
    ).toMatchObject({ BOT_MODE, WEBHOOK_PORT: 3000 });
    expect(() => loadEnv({ ...base, BOT_MODE, WEBHOOK_URL })).toThrow(
      'WEBHOOK_SECRET',
    );
    expect(() =>
      loadEnv({
        ...base,
        BOT_MODE,
        WEBHOOK_URL: `${WEBHOOK_URL}?wrong=1`,
        WEBHOOK_SECRET,
      }),
    ).toThrow('WEBHOOK_URL');
    expect(() =>
      loadEnv({
        ...base,
        BOT_MODE,
        WEBHOOK_URL: WEBHOOK_URL.replace('https:', 'http:'),
        WEBHOOK_SECRET,
      }),
    ).toThrow('WEBHOOK_URL');
  });
});
