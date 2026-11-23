import { sql } from 'drizzle-orm';
import { allowedUpdates, createBot } from './bot/bot.factory.ts';
import { webhookServer } from './bot/webhook.ts';
import { botInfoSchema } from './bot/middlewares/update.ts';
import { ConfigError, loadEnv } from './config/env.ts';
import { questionsById } from './data/bmw-questions.ts';
import { connectDatabase } from './storage/database.ts';
import { postgresQuizStore } from './storage/quiz.store.ts';
import { log } from './utils/logger.ts';
import type { LogEvent } from './utils/logger.ts';

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const database = connectDatabase(env.DATABASE_URL, {
    max: env.DATABASE_POOL_MAX,
    log,
  });
  const store = postgresQuizStore(
    database.db,
    questionsById,
    env.SESSION_TTL_SECONDS * 1000,
  );
  const { bot, sweep } = createBot(env, store, log);
  const webhook =
    env.BOT_MODE === 'webhook'
      ? webhookServer(
          env.WEBHOOK_SECRET,
          (update) => bot.handleUpdate(update),
          log,
        )
      : undefined;
  const maintenance = setInterval(sweep, 2_000).unref();

  let polling: Promise<void> | undefined;
  let shutdown: Promise<void> | undefined;

  function stop(event?: LogEvent): Promise<void> {
    if (event) {
      log(event);
      process.exitCode = 1;
    }
    if (shutdown) return shutdown;
    clearInterval(maintenance);
    const deadline = setTimeout(() => {
      log('shutdown_timeout');
      process.exit(1);
    }, 25_000).unref();
    shutdown = (async () => {
      try {
        const results = await Promise.allSettled([
          bot.stop(),
          polling,
          webhook?.stop(),
        ]);
        await boot.catch(() => undefined);
        if (results.some(({ status }) => status === 'rejected')) {
          log('shutdown_error');
          process.exitCode = 1;
        }
        try {
          await database.close();
        } catch {
          log('shutdown_error');
          process.exitCode = 1;
        }
        log('stopped');
      } finally {
        clearTimeout(deadline);
      }
    })();
    return shutdown;
  }

  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
  process.on('uncaughtException', () => void stop('uncaught_exception'));
  process.on('unhandledRejection', () => void stop('unhandled_rejection'));

  const stopping = () => shutdown !== undefined;

  async function start(): Promise<void> {
    await database.db
      .execute(
        sql`select
      (select id from quiz_players limit 0),
      (select player_id from quiz_rounds limit 0),
      (select player_id from quiz_unresolved limit 0)`,
      )
      .catch(() => {
        void stop('database_start_error');
      });
    if (stopping()) return;
    const info = await bot.api.getMe();
    botInfoSchema.parse(info);
    bot.botInfo = info;
    if (stopping()) return;

    if (env.BOT_MODE === 'webhook' && webhook) {
      await webhook.listen(env.WEBHOOK_HOST, env.WEBHOOK_PORT);
      webhook.server.on('error', () => void stop('webhook_server_error'));
      if (stopping()) return;
      await bot.api.setWebhook(env.WEBHOOK_URL, {
        secret_token: env.WEBHOOK_SECRET,
        allowed_updates: [...allowedUpdates],
        max_connections: 32,
      });
      if (!stopping()) log('webhook_started');
    } else {
      polling = bot
        .start({
          allowed_updates: [...allowedUpdates],
          timeout: 7,
          onStart: () => {
            log('polling_started');
          },
        })
        .catch(() => {
          if (!stopping()) void stop('startup_error');
        });
    }
  }

  const boot = start();
  await boot.catch(() => {
    if (!stopping()) return stop('startup_error');
  });
}

void main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    log('config_error');
    process.stderr.write(`${error.message}\n`);
  } else {
    log('startup_error');
  }
  process.exitCode = 1;
});
