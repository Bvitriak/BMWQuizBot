import { z } from 'zod';

function integer(fallback: number, min: number, max: number) {
  return z
    .string()
    .regex(/^[0-9]{1,7}$/)
    .transform(Number)
    .pipe(z.int().min(min).max(max))
    .default(fallback);
}

const head = z.object({
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  BOT_TOKEN: z.string().regex(/^[1-9][0-9]{4,15}:[A-Za-z0-9_-]{30,64}$/),
  DATABASE_URL: z
    .string()
    .max(2048)
    .pipe(z.url({ protocol: /^postgres(?:ql)?$/ }))
    .refine((value) => {
      const url = new URL(value);
      return Boolean(
        url.hostname && url.username && url.pathname.length > 1 && !url.hash,
      );
    }),
  SESSION_TTL_SECONDS: integer(1800, 30, 86400),
  RATE_LIMIT_WINDOW_SECONDS: integer(10, 1, 300),
  RATE_LIMIT_MAX_UPDATES: integer(15, 1, 100),
  RATE_LIMIT_MAX_USERS: integer(20000, 1, 100000),
  DATABASE_POOL_MAX: integer(8, 1, 32),
});

export function loadDatabaseUrl(
  source: Readonly<Record<string, string | undefined>>,
  name:
    | 'DATABASE_URL'
    | 'DATABASE_MIGRATION_URL'
    | 'TEST_DATABASE_URL'
    | 'TEST_MIGRATION_URL',
): string {
  const parsed = head.shape.DATABASE_URL.safeParse(source[name]);
  if (!parsed.success)
    throw new ConfigError(`Check environment variables: ${name}`);
  return parsed.data;
}

const envSchema = z.discriminatedUnion('BOT_MODE', [
  head.extend({ BOT_MODE: z.literal('polling') }),
  head.extend({
    BOT_MODE: z.literal('webhook'),
    WEBHOOK_URL: z
      .string()
      .trim()
      .max(2048)
      .pipe(z.url({ protocol: /^https$/ }))
      .refine((value) => {
        const url = new URL(value);
        return (
          url.pathname === '/telegram' &&
          ['', '80', '88', '8443'].includes(url.port) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash
        );
      }),
    WEBHOOK_SECRET: z.string().regex(/^[A-Za-z0-9_-]{32,256}$/),
    WEBHOOK_HOST: z
      .enum(['127.0.0.1', '::1', '0.0.0.0', '::'])
      .default('127.0.0.1'),
    WEBHOOK_PORT: integer(3000, 1, 65535),
  }),
]);

export type Env = z.output<typeof envSchema>;

export function loadEnv(
  source: Readonly<Record<string, string | undefined>>,
): Env {
  const result = envSchema.safeParse({
    ...source,
    BOT_MODE: source.BOT_MODE ?? 'polling',
  });
  if (!result.success) {
    const keys = new Set(result.error.issues.map(({ path }) => path.join('.')));
    throw new ConfigError(
      `Check environment variables: ${[...keys].join(', ')}`,
    );
  }
  return result.data;
}

export class ConfigError extends Error {}
