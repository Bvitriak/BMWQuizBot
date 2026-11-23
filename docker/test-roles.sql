CREATE ROLE quiz_test_migrator LOGIN PASSWORD 'local-test-migrator-only';
CREATE ROLE quiz_test_app LOGIN PASSWORD 'local-test-app-only';
ALTER DATABASE bmwquiz_test OWNER TO quiz_test_migrator;
REVOKE ALL ON DATABASE bmwquiz_test FROM PUBLIC;
GRANT CONNECT ON DATABASE bmwquiz_test TO quiz_test_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO quiz_test_app;
ALTER DEFAULT PRIVILEGES FOR ROLE quiz_test_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO quiz_test_app;
