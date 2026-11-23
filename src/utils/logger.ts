const LEVELS = {
  polling_started: 'info',
  webhook_started: 'info',
  stopped: 'info',
  update_error: 'warn',
  callback_ack_error: 'warn',
  webhook_request_error: 'warn',
  webhook_server_error: 'error',
  database_pool_error: 'error',
  database_start_error: 'error',
  database_import_error: 'error',
  database_migration_error: 'error',
  config_error: 'error',
  startup_error: 'error',
  shutdown_error: 'error',
  shutdown_timeout: 'error',
  uncaught_exception: 'error',
  unhandled_rejection: 'error',
} as const;

export type LogEvent = keyof typeof LEVELS;
export type Logger = (event: LogEvent) => void;

// Только события из белого списка: исходные ошибки, update и аргументы API сюда не передаются.
export const log: Logger = (event) => {
  const level = LEVELS[event];
  const line = JSON.stringify({ time: new Date().toISOString(), level, event });
  (level === 'info' ? process.stdout : process.stderr).write(`${line}\n`);
};
