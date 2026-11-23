import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { Logger } from '../utils/logger.ts';

export function connectDatabase(
  url: string,
  options: { max?: number; timeoutMs?: number; log?: Logger } = {},
) {
  const pool = new pg.Pool({
    connectionString: url,
    max: options.max ?? 8,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 15_000,
    statement_timeout: options.timeoutMs ?? 5_000,
    lock_timeout: options.timeoutMs ?? 3_000,
    idle_in_transaction_session_timeout: 10_000,
  });
  pool.on('error', () => {
    options.log?.('database_pool_error');
  });
  return { db: drizzle(pool), close: () => pool.end() };
}

export type Database = ReturnType<typeof connectDatabase>['db'];
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
