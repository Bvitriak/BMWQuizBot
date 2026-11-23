import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { ConfigError, loadDatabaseUrl } from '../config/env.ts';
import { log } from '../utils/logger.ts';
import { connectDatabase } from './database.ts';

try {
  const url = loadDatabaseUrl(process.env, 'DATABASE_MIGRATION_URL');
  const database = connectDatabase(url, { max: 1, timeoutMs: 30_000, log });
  try {
    await migrate(database.db, { migrationsFolder: resolve('drizzle') });
    process.stdout.write('Миграции PostgreSQL применены.\n');
  } finally {
    await database.close();
  }
} catch (error) {
  if (error instanceof ConfigError) process.stderr.write(`${error.message}\n`);
  else log('database_migration_error');
  process.exitCode = 1;
}
