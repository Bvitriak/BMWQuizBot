import { resolve } from 'node:path';
import { ConfigError, loadDatabaseUrl } from '../config/env.ts';
import { questionIds } from '../data/bmw-questions.ts';
import { log } from '../utils/logger.ts';
import { connectDatabase } from './database.ts';
import { importLegacy } from './legacy-import.ts';

try {
  const url = loadDatabaseUrl(process.env, 'DATABASE_URL');
  const database = connectDatabase(url, { max: 1, timeoutMs: 30_000, log });
  try {
    const result = await importLegacy(
      database.db,
      resolve(process.argv[2] ?? 'users.json'),
      questionIds,
    );
    process.stdout.write(
      `Imported: ${result.imported}. Existing players skipped: ${result.skipped}.\n`,
    );
  } finally {
    await database.close();
  }
} catch (error) {
  if (error instanceof ConfigError) process.stderr.write(`${error.message}\n`);
  else log('database_import_error');
  process.exitCode = 1;
}
