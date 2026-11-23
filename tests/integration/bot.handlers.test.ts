import { once } from 'node:events';
import { createServer } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createBot } from '../../src/bot/bot.factory.ts';
import { loadEnv } from '../../src/config/env.ts';
import { questions } from '../../src/data/bmw-questions.ts';
import {
  clearTestRows,
  testDatabase,
  testDatabaseUrl,
  testStore,
} from './database.ts';

const testToken = `10000:${'x'.repeat(35)}`;
const apiPayload = z.object({
  text: z.string().optional(),
  reply_markup: z
    .object({
      inline_keyboard: z
        .array(
          z.array(z.object({ text: z.string(), callback_data: z.string() })),
        )
        .optional(),
    })
    .optional(),
  callback_query_id: z.string().optional(),
});
const resources: (() => Promise<void>)[] = [];

beforeEach(clearTestRows);
afterEach(async () => {
  await Promise.all(resources.splice(0).map((close) => close()));
});

async function setup(rate = 100) {
  const calls: { method: string; data: z.output<typeof apiPayload> }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const input: unknown = JSON.parse(Buffer.concat(chunks).toString());
      calls.push({ method: req.url ?? '', data: apiPayload.parse(input) });
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ ok: true, result: true }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  resources.push(
    () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  );
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing mock API address');
  const env = loadEnv({
    BOT_TOKEN: testToken,
    DATABASE_URL: testDatabaseUrl('TEST_DATABASE_URL'),
    RATE_LIMIT_MAX_UPDATES: String(rate),
  });
  const database = testDatabase();
  resources.push(database.close);
  const store = testStore(database);
  const options: NonNullable<Parameters<typeof createBot>[3]> = {
    botInfo: {
      id: 10000,
      is_bot: true,
      first_name: 'Quiz',
      username: 'BMWQuizTestBot',
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
      has_topics_enabled: false,
      allows_users_to_create_topics: false,
      supports_guest_queries: false,
      needs_inline_query_location: false,
      has_topic_sidebar: false,
      can_manage_bots: false,
      supports_join_request_queries: false,
    },
    client: {
      apiRoot: `http://127.0.0.1:${address.port}`,
      buildUrl: (_root, _token, method) =>
        `http://127.0.0.1:${address.port}/${method}`,
    },
  };
  const buildBot = () => createBot(env, store, vi.fn(), options).bot;
  let bot = buildBot();
  let updateId = 0;
  const date = 100;
  const from = (id: number) => ({
    id,
    is_bot: false as const,
    first_name: 'Player',
  });
  const chat = (id: number) =>
    id > 0
      ? { id, type: 'private' as const, first_name: 'Player' }
      : { id, type: 'group' as const, title: 'Test' };
  const messageRef = (chatId: number) => ({
    chat: chat(chatId),
    date,
    message_id: 1,
  });
  return {
    calls,
    store,
    restartProcess: () => {
      bot = buildBot();
    },
    command(text: string, userId = 1, chatId = userId) {
      const commandLength = text.split(' ')[0]?.length ?? 0;
      return bot.handleUpdate({
        update_id: ++updateId,
        message: {
          ...messageRef(chatId),
          from: from(userId),
          text,
          ...(text.startsWith('/')
            ? {
                entities: [
                  {
                    type: 'bot_command' as const,
                    offset: 0,
                    length: commandLength,
                  },
                ],
              }
            : {}),
        },
      });
    },
    click(data: string, userId = 1, chatId = userId) {
      const id = String(++updateId);
      return bot.handleUpdate({
        update_id: updateId,
        callback_query: {
          id,
          from: from(userId),
          data,
          message: messageRef(chatId),
          chat_instance: 'test',
        },
      });
    },
    button(label: string) {
      const data = calls.findLast(
        (call) => call.data.reply_markup?.inline_keyboard,
      )?.data;
      const item = data?.reply_markup?.inline_keyboard
        ?.flat()
        .find(({ text }) => text === label);
      if (!item) throw new Error(`Missing button: ${label}`);
      return item.callback_data;
    },
  };
}

describe('bot handlers via mock Telegram API', () => {
  it('routes commands and rejects foreign commands and malformed payloads', async () => {
    const h = await setup();
    await h.command('/start abc_123');
    await h.command('/help@BMWQuizTestBot');
    await h.command('/stats');
    await h.command('/start invalid!');
    await h.command('/quiz@OtherBot');
    await h.command('/quiz trailing');
    await h.command('/stats', 1, -100);
    await h.command('🗑️ Reset stats');
    expect(h.calls.map(({ method }) => method)).toEqual(
      Array.from({ length: 4 }, () => '/sendMessage'),
    );
    expect(h.calls.map(({ data }) => data.text)).toEqual([
      expect.stringContaining('Welcome'),
      expect.stringContaining('Help'),
      expect.stringContaining('Your all-time statistics'),
      expect.stringContaining('statistics have been reset'),
    ]);
  });

  it('acknowledges duplicate, stale, tampered and foreign callbacks without double scoring', async () => {
    const h = await setup();
    await h.command('/quiz');
    const button = h.button('Skip question');
    const foreign = h.click(button, 2, 1);
    const wrongChat = h.click(button, 1, -100);
    await Promise.all([foreign, wrongChat]);
    await h.click(button.replace('.s.', '.0.'));
    await h.click('я'.repeat(33));
    await Promise.all([h.click(button), h.click(button)]);
    h.restartProcess();
    await h.click(button);
    expect(await h.store.stats(1)).toMatchObject({
      entry: { score: { skipped: 1 }, completed: 0 },
    });
    expect(
      h.calls.filter(({ method }) => method === '/answerCallbackQuery'),
    ).toHaveLength(7);
    expect(
      h.calls.filter(({ method }) => method === '/editMessageText'),
    ).toHaveLength(1);
    expect(
      h.calls.find(({ method }) => method === '/editMessageText')?.data.text,
    ).toContain('Question skipped');
  });

  it('keeps callback acknowledgement when a user exceeds the shared rate limit', async () => {
    const h = await setup(1);
    await h.command('/quiz');
    await h.command('/stats');
    await h.click(h.button('a'));
    expect(h.calls.map(({ method }) => method)).toEqual([
      '/sendMessage',
      '/answerCallbackQuery',
    ]);
    expect((await h.store.stats(1)).entry.score).toEqual({
      correct: 0,
      incorrect: 0,
      skipped: 0,
    });
  });

  it('finishes a round and reviews mistakes without incrementing all-time stats', async () => {
    const h = await setup();
    await h.command('/quiz');
    for (let i = 0; i < questions.length; i++)
      await h.click(h.button('Skip question'));
    const final = h.calls.findLast(
      ({ method }) => method === '/editMessageText',
    )?.data.text;
    expect(final).toContain('Quiz complete!');
    expect(final?.length).toBeLessThanOrEqual(4096);
    const stats = await h.store.stats(1);
    expect(stats.entry).toEqual({
      score: { correct: 0, incorrect: 0, skipped: questions.length },
      completed: 1,
    });
    await h.click(h.button('🔁 Repeat mistakes'));
    for (let i = 0; i < questions.length; i++)
      await h.click(h.button('Skip question'));
    expect(
      h.calls.findLast(({ method }) => method === '/editMessageText')?.data
        .text,
    ).toContain('Mistake review complete!');
    expect(await h.store.stats(1)).toEqual(stats);
    const restart = h.button('🔄 Restart');
    await h.click(restart);
    expect(
      h.calls.findLast(({ method }) => method === '/editMessageText')?.data
        .text,
    ).toContain('Question 1/');
    const sent = h.calls.length;
    await h.click(restart);
    expect(h.calls.slice(sent).map(({ method }) => method)).toEqual([
      '/answerCallbackQuery',
    ]);
    const first = h.button('a');
    await h.command('/restart');
    await h.click(first);
    expect(await h.store.stats(1)).toEqual(stats);
  });

  it('lists only ready topics, binds selection to its owner and chat and asks five distinct questions', async () => {
    const h = await setup();
    await h.command('/quiz');
    await h.click(h.button('Skip question'));
    await h.command('/topics');
    const menu = h.calls.at(-1)?.data.reply_markup?.inline_keyboard?.flat();
    expect(menu?.map(({ text }) => text).sort()).toEqual(['BMW M', 'History']);
    const selection = h.button('BMW M');
    await h.click(selection, 2, 1);
    await h.click(selection, 1, -10);
    await h.click(selection.replace('.m.t.', '.history.t.'));
    const previousEdits = h.calls.filter(
      ({ method }) => method === '/editMessageText',
    ).length;
    h.restartProcess();
    await h.click(selection);
    await h.click(selection);
    expect(
      h.calls.filter(({ method }) => method === '/editMessageText'),
    ).toHaveLength(previousEdits + 1);
    const asked = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const text = h.calls.findLast(
        ({ method }) => method === '/editMessageText',
      )?.data.text;
      const questionText = text?.match(
        /BMW M · Question \d\/5:\n([^\n]+)/,
      )?.[1];
      if (!questionText) throw new Error('Missing topical question');
      asked.add(questionText);
      await h.click(h.button('Skip question'));
    }
    expect(asked.size).toBe(5);
    expect((await h.store.stats(1)).entry).toMatchObject({
      score: { skipped: 6 },
      completed: 0,
    });
    await h.command('/quiz');
    expect(h.calls.at(-1)?.data.text).toContain('Question 2/');
  });

  it('reviews skipped and incorrect questions privately, then removes them after correct answers', async () => {
    const h = await setup();
    await h.command('/quiz');
    await h.click(h.button('Skip question'));
    const currentQuestion = () => {
      const text = h.calls.findLast(
        ({ data }) => data.reply_markup?.inline_keyboard,
      )?.data.text;
      const question = questions.find(({ text: prompt }) =>
        text?.includes(`:\n${prompt}\n`),
      );
      if (!question) throw new Error('Expected a question');
      return question;
    };
    const wrongIndex = currentQuestion().options.findIndex(
      ({ correct }) => !correct,
    );
    await h.click(h.button('abc'.charAt(wrongIndex)));
    h.restartProcess();
    const previousCount = h.calls.length;
    await h.command('/mistakes', 1, -10);
    expect(h.calls).toHaveLength(previousCount);
    await h.command('/mistakes');
    expect(h.calls.at(-1)?.data.text).toContain('Mistake review 1/2');
    for (let i = 0; i < 2; i++) {
      const correctIndex = currentQuestion().options.findIndex(
        ({ correct }) => correct,
      );
      await h.click(h.button('abc'.charAt(correctIndex)));
    }
    await h.command('/mistakes');
    expect(h.calls.at(-1)?.data.text).toBe('No mistakes to review yet.');
    expect((await h.store.stats(1)).entry.score).toEqual({
      correct: 0,
      incorrect: 1,
      skipped: 1,
    });
  });
});
