import { createHmac } from 'node:crypto';
import { Bot } from 'grammy';
import type { BotConfig, Context } from 'grammy';
import type { Env } from '../config/env.ts';
import type { QuizStore } from '../storage/quiz.store.ts';
import { createCallbackCodec } from '../utils/callback.ts';
import type { Logger } from '../utils/logger.ts';
import { commandAction } from './handlers/commands.ts';
import { quizHandlers } from './handlers/quiz.ts';
import { help, menu, statsMenu, statsText, welcome } from './keyboards.ts';
import { acknowledge } from './middlewares/errors.ts';
import { rateLimiter } from './middlewares/rate-limit.ts';
import { ackSchema, readCallback, readMessage } from './middlewares/update.ts';

export const allowedUpdates = ['message', 'callback_query'] as const;

export function createBot(
  env: Env,
  store: QuizStore,
  log: Logger,
  options: Pick<BotConfig<Context>, 'botInfo' | 'client'> = {},
) {
  const bot = new Bot(env.BOT_TOKEN, {
    ...options,
    client: {
      ...options.client,
      timeoutSeconds: 10,
      sensitiveLogs: false,
      canUseWebhookReply: () => false,
    },
  });
  const codec = createCallbackCodec(
    createHmac('sha256', env.BOT_TOKEN)
      .update('bmwquiz:callback-key:v1')
      .digest(),
  );
  const rate = rateLimiter(
    env.RATE_LIMIT_MAX_USERS,
    env.RATE_LIMIT_WINDOW_SECONDS * 1000,
    env.RATE_LIMIT_MAX_UPDATES,
  );
  const quiz = quizHandlers(store, codec);
  const busy = new Set<number>();

  async function runForUser(
    userId: number,
    run: () => Promise<void>,
  ): Promise<void> {
    if (!rate.allow(userId) || busy.has(userId)) return;
    busy.add(userId);
    try {
      await run();
    } finally {
      busy.delete(userId);
    }
  }

  bot.use(async ({ update, api, me }) => {
    if (update.callback_query !== undefined) {
      const id = ackSchema.safeParse(update.callback_query);
      if (!id.success) return;
      const ack = acknowledge(api, id.data.id, log);
      try {
        const callback = readCallback(update.callback_query);
        if (!callback) return;
        const scope = {
          userId: callback.from.id,
          chatId: callback.message.chat.id,
        };
        await runForUser(scope.userId, async () => {
          const payload = codec.decode(callback.data, scope);
          if (payload)
            await quiz.click(api, scope, callback.message.message_id, payload);
        });
      } finally {
        await ack;
      }
      return;
    }
    const message = readMessage(update.message);
    if (!message) return;
    const { from, chat } = message;
    const scope = { chatId: chat.id, userId: from.id };
    await runForUser(from.id, async () => {
      const action = commandAction(message, me.username);
      switch (action) {
        case 'menu':
          await api.sendMessage(chat.id, welcome, { reply_markup: menu });
          return;
        case 'help':
          await api.sendMessage(chat.id, help, { reply_markup: menu });
          return;
        case 'quiz':
        case 'restart':
          await quiz.open(api, scope, action === 'restart');
          return;
        case 'topics':
          await quiz.topics(api, scope);
          return;
        case 'mistakes':
          if (chat.type === 'private' && chat.id === from.id)
            await quiz.mistakes(api, scope);
          return;
        case 'stats':
        case 'resetStats': {
          if (chat.type !== 'private' || chat.id !== from.id) return;
          if (action === 'resetStats') {
            await store.reset(from.id);
            await api.sendMessage(
              chat.id,
              '📊 Your statistics have been reset!',
              { reply_markup: statsMenu },
            );
            return;
          }
          const { entry, rank } = await store.stats(from.id);
          await api.sendMessage(chat.id, statsText(entry, rank), {
            reply_markup: statsMenu,
          });
          return;
        }
      }
    });
  });
  bot.catch(() => {
    log('update_error');
  });

  return {
    bot,
    sweep: rate.sweep,
  };
}
