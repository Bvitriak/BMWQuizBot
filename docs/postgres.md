# PostgreSQL for BMWQuizBot

The test Compose stack uses the temporary `bmwquiz_test` database. Do not connect a self-hosted bot to it. Use a dedicated PostgreSQL 18 instance with a persistent volume, backups, and no publicly exposed port.

## Persistent database with Docker

From the project root on your server, generate three distinct passwords. Git ignores the secret directory. The files use mode `0444` so that unprivileged container processes can read them, while mode `0700` restricts access to the directory on the host. If the directory already exists, the block stops without changing the passwords.

```sh
(
  set -eu
  umask 077
  mkdir -m 700 .db-secrets
  for name in admin_password migrator_password app_password; do
    openssl rand -hex 32 >".db-secrets/$name"
    chmod 444 ".db-secrets/$name"
  done
)
```

```sh
docker compose --env-file /dev/null -f docker/compose.postgres.yaml up -d --wait db
docker compose --env-file /dev/null -f docker/compose.postgres.yaml run --rm --build migrate
```

PostgreSQL does not publish a port and stores data in `bmwquiz-db_pgdata`. Do not delete this volume during upgrades. Connect the bot container to `bmwquiz-db_backend` and to a separate network that can reach Telegram. In `DATABASE_URL`, use host `db`, database `bmwquiz`, role `bmwquiz_app`, and the password from `.db-secrets/app_password`. Do not give the bot administrator or migration credentials. Use `sslmode=disable` only on this isolated network on a single server, and do not attach unrelated containers.

The secret files initialize the roles only when PostgreSQL starts on an empty volume. To rotate a password, update the PostgreSQL role and its secret together. Replacing a file does not change an existing database role.

For a backup, replace the destination below with a restricted directory outside the repository. Before starting the bot, verify that `pg_restore` can restore the dump to a separate database.

```sh
umask 077
docker compose --env-file /dev/null -f docker/compose.postgres.yaml exec -T db sh -ec \
  'export PGPASSWORD="$(cat /run/secrets/admin_password)"; exec pg_dump -U bmwquiz_admin -d bmwquiz -Fc' \
  > /path/to/private/bmwquiz.dump
```

## Existing PostgreSQL server: roles and permissions

As a PostgreSQL administrator, create two roles and a dedicated database. In `psql`, `\password` prompts for a password without putting it in SQL history:

```sql
CREATE ROLE bmwquiz_migrator LOGIN;
CREATE ROLE bmwquiz_app LOGIN;
\password bmwquiz_migrator
\password bmwquiz_app
CREATE DATABASE bmwquiz OWNER bmwquiz_migrator;
REVOKE ALL ON DATABASE bmwquiz FROM PUBLIC;
GRANT CONNECT ON DATABASE bmwquiz TO bmwquiz_app;
\connect bmwquiz
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO bmwquiz_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bmwquiz_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bmwquiz_app;
```

Use `bmwquiz_migrator` in `DATABASE_MIGRATION_URL` only for `pnpm db:migrate`. Use `bmwquiz_app` in `DATABASE_URL` for the bot and importer; neither needs permission to change the schema. For a network connection, use TLS with certificate and hostname verification (`sslmode=verify-full`). Percent-encode passwords in connection URLs. `DATABASE_POOL_MAX` sets the connection pool size per process.

## First upgrade and import

1. Stop the old bot and make a private backup of `users.json`. Do this before starting the new version so that new records do not occupy existing player keys in PostgreSQL.
2. Apply migrations once using the migration role: `pnpm db:migrate`.
3. If you have a legacy file, use the application role and run `pnpm db:import` or `pnpm db:import /path/to/users.json`. Check the imported and skipped counts. The importer does not log personal data, change the source file, or overwrite existing players.
4. Start the bot after importing. In the Docker `app` image, use `node dist/storage/migrate.cli.js` and `node dist/storage/import.cli.js /path/to/users.json`. Mount the import file read-only; never bake it into the image.

The importer supports aggregate counts from the TypeScript version and known fields from the legacy JavaScript version: answers, skips, the current question, and mistakes. Old rounds resume in the player's private chat because the original chat is unknown. The legacy review queue is not migrated, but unresolved questions remain available through `/mistakes`. Data that was never saved in `users.json` cannot be recovered.

## Maintenance

- Generate migrations with `pnpm db:generate --name <name>` and review them before applying. Do not run two migration jobs at once.
- Keep PostgreSQL and backups private. Review the storage-location and retention requirements that apply to your deployment before handling player data. The database stores Telegram IDs and quiz progress, not names or message text.
- To delete a player's data, verify the request and delete their row from `quiz_players` by ID. Foreign keys remove associated rounds and mistakes. Backups have a separate retention schedule. Do not reimport an old file after deleting players.
