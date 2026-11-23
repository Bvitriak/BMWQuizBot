# PostgreSQL для BMWQuizBot

Тестовый Compose использует временную базу `bmwquiz_test`. Не назначайте её рабочему боту. Для рабочего экземпляра нужна отдельная PostgreSQL 18 с постоянным томом, резервными копиями и без публичного порта.

## Рабочая база в Docker

На сервере из корня проекта создайте три разных пароля. Каталог игнорируется Git. Права `0444` на файлах нужны непривилегированным процессам в контейнерах; на хосте доступ к каталогу ограничен правами `0700`. Если каталог уже существует, этот блок прервётся, не меняя пароли.

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

База не публикует порт и хранит данные в томе `bmwquiz-db_pgdata`. Не удаляйте том при обновлении. Подключите контейнер бота к сети `bmwquiz-db_backend` и отдельно к сети с выходом в Telegram. В `DATABASE_URL` используйте хост `db`, базу `bmwquiz`, роль `bmwquiz_app` и её пароль из `.db-secrets/app_password`. Не передавайте доступ администратора или мигратора боту. `sslmode=disable` допустим только внутри этой изолированной сети на одном сервере. Не подключайте к ней посторонние контейнеры.

Файлы паролей используются для создания ролей только при первом запуске на пустом томе. Для ротации меняйте пароль в PostgreSQL и соответствующий секрет согласованно. Не подменяйте файлы в надежде, что пароль в существующей базе обновится автоматически.

Пример резервной копии: замените путь в последней строке на закрытый каталог вне репозитория. Успешный `pg_dump` ещё не подтверждает возможность восстановления: проверьте `pg_restore` в отдельной базе до первого запуска бота.

```sh
umask 077
docker compose --env-file /dev/null -f docker/compose.postgres.yaml exec -T db sh -ec \
  'export PGPASSWORD="$(cat /run/secrets/admin_password)"; exec pg_dump -U bmwquiz_admin -d bmwquiz -Fc' \
  > /закрытый/каталог/bmwquiz.dump
```

## Отдельный сервер PostgreSQL: роли и права

Под администратором PostgreSQL создайте две роли и выделенную базу. В `psql` команда `\password` запрашивает пароль без сохранения в SQL-истории:

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

`DATABASE_MIGRATION_URL` использует `bmwquiz_migrator` и нужен только команде `pnpm db:migrate`. В `DATABASE_URL` у бота и импортера используйте `bmwquiz_app`, которому не нужна возможность менять схему. Для сетевого подключения используйте TLS с проверкой имени и сертификата (`sslmode=verify-full`); пароли в URL должны быть percent-encoded. Размер пула процесса задаёт `DATABASE_POOL_MAX`.

## Первое обновление и импорт

1. Остановите старого бота и создайте закрытую резервную копию прежнего `users.json`. Сделайте это до запуска новой версии, чтобы свежие данные не заняли ключи игроков в PostgreSQL.
2. Примените миграции один раз с ролью мигратора: `pnpm db:migrate`.
3. Если есть старый файл, импортируйте его ролью приложения: `pnpm db:import` или `pnpm db:import /путь/к/users.json`. Сверьте число импортированных и пропущенных строк. Команда не записывает персональные данные в журнал, исходный файл не меняет, существующих игроков не перезаписывает.
4. Запустите бота только после импорта. Если используется Docker-образ `app`, соответствующие команды в контейнере – `node dist/storage/migrate.cli.js` и `node dist/storage/import.cli.js /путь/к/users.json`. Подключайте файл импорта только на чтение и не включайте его в образ.

Импорт поддерживает итоговые счётчики из TypeScript-версии и известные поля старой JavaScript-версии: ответы, пропуски, текущий вопрос и список ошибок. Для старых раундов чат неизвестен, поэтому они восстанавливаются в личном чате игрока. Временная очередь старого режима пересдачи не переносится; сами ошибки доступны через `/mistakes`. То, чего прежний `users.json` не сохранял, восстановить нельзя.

## Эксплуатация

- Миграции генерируются через `pnpm db:generate --name <имя>` и проверяются перед применением. Не запускайте два мигратора одновременно.
- Храните PostgreSQL и резервные копии в закрытом контуре; для работы с данными российских игроков заранее проверьте применимые требования к месту хранения и срокам удаления. В БД есть Telegram ID и связанный прогресс, но нет имён и текстов переписки.
- Если требуется удаление данных игрока, оператор удаляет запись из `quiz_players` по его ID с подтверждением запроса. Внешние ключи удаляют связанные раунды и ошибки; резервные копии живут по отдельному циклу хранения. Не импортируйте старый файл повторно после удаления игроков.
