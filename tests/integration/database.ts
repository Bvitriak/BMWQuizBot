import { sql } from 'drizzle-orm';
import { loadDatabaseUrl } from '../../src/config/env.ts';
import { questionsById } from '../../src/data/bmw-questions.ts';
import { connectDatabase } from '../../src/storage/database.ts';
import { postgresQuizStore } from '../../src/storage/quiz.store.ts';

export function testDatabaseUrl(
  name: 'TEST_DATABASE_URL' | 'TEST_MIGRATION_URL',
) {
  const url = loadDatabaseUrl(process.env, name);
  const parsed = new URL(url);
  const user =
    name === 'TEST_DATABASE_URL' ? 'quiz_test_app' : 'quiz_test_migrator';
  if (
    parsed.pathname !== '/bmwquiz_test' ||
    parsed.username !== user ||
    !['db', 'localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    [...parsed.searchParams.keys()].some((key) => key !== 'sslmode')
  ) {
    throw new Error(
      'Integration tests require the dedicated database and test roles',
    );
  }
  return url;
}

export function testDatabase() {
  return connectDatabase(testDatabaseUrl('TEST_DATABASE_URL'));
}

export function testMigrator() {
  return connectDatabase(testDatabaseUrl('TEST_MIGRATION_URL'), { max: 1 });
}

export function testStore(database: ReturnType<typeof testDatabase>) {
  return postgresQuizStore(database.db, questionsById, 60_000);
}

export async function clearTestRows() {
  const migrator = testMigrator();
  try {
    await migrator.db.execute(
      sql`truncate quiz_players, quiz_rounds, quiz_unresolved`,
    );
  } finally {
    await migrator.close();
  }
}
