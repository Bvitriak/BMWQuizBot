#!/bin/sh
set -eu

read_password() {
  value=$(cat "$1")
  case "$value" in
    ''|*[!0123456789abcdef]*) return 1 ;;
  esac
  test "${#value}" -eq 64
  printf '%s' "$value"
}

(
  MIGRATOR_PASSWORD=$(read_password /run/secrets/migrator_password)
  APP_PASSWORD=$(read_password /run/secrets/app_password)
  export MIGRATOR_PASSWORD APP_PASSWORD

  psql --no-psqlrc --quiet --set ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv migrator_password MIGRATOR_PASSWORD
\getenv app_password APP_PASSWORD
BEGIN;
SET LOCAL log_min_error_statement = 'panic';
CREATE ROLE bmwquiz_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE bmwquiz_app LOGIN PASSWORD :'app_password';
ALTER DATABASE bmwquiz OWNER TO bmwquiz_migrator;
REVOKE ALL ON DATABASE bmwquiz FROM PUBLIC;
GRANT CONNECT ON DATABASE bmwquiz TO bmwquiz_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO bmwquiz_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bmwquiz_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bmwquiz_app;
COMMIT;
SQL
)
