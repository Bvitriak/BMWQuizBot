import { setTimeout } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { testMigrator } from './database.ts';

export default async function setup() {
  const migrator = testMigrator();
  try {
    const deadline = Date.now() + 20_000;
    for (;;) {
      try {
        await migrator.db.execute(sql`select 1`);
        break;
      } catch {
        if (Date.now() >= deadline)
          throw new Error('Test PostgreSQL did not become available');
        await setTimeout(500);
      }
    }
    await migrate(migrator.db, { migrationsFolder: 'drizzle' });
  } finally {
    await migrator.close();
  }
}
