import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import type { AnswerResult, Category } from '../domain/quiz.types.ts';

export const roundMode = pgEnum('quiz_round_mode', ['quiz', 'topic', 'review']);

export const players = pgTable(
  'quiz_players',
  {
    id: bigint({ mode: 'number' }).primaryKey(),
    correct: integer().notNull().default(0),
    incorrect: integer().notNull().default(0),
    skipped: integer().notNull().default(0),
    completed: integer().notNull().default(0),
    ranked: boolean().notNull().default(false),
    menuNonce: text('menu_nonce'),
    menuChatId: bigint('menu_chat_id', { mode: 'number' }),
    menuUntil: timestamp('menu_until', { withTimezone: true }),
  },
  (row) => [
    index('quiz_rank_correct_idx')
      .on(row.correct)
      .where(sql`${row.ranked}`),
    check(
      'quiz_players_positive_id',
      sql`${row.id} BETWEEN 1 AND 9007199254740991`,
    ),
    check(
      'quiz_players_safe_counters',
      sql`
    ${row.correct} BETWEEN 0 AND 1000000000 AND ${row.incorrect} BETWEEN 0 AND 1000000000
    AND ${row.skipped} BETWEEN 0 AND 1000000000 AND ${row.completed} BETWEEN 0 AND 1000000000
  `,
    ),
    check(
      'quiz_players_menu_is_complete',
      sql`
    num_nonnulls(${row.menuNonce}, ${row.menuChatId}, ${row.menuUntil}) IN (0, 3)
    AND (${row.menuNonce} IS NULL OR ${row.menuNonce} ~ '^[A-Za-z0-9_-]{16}$')
    AND (${row.menuChatId} IS NULL OR ${row.menuChatId} <> 0)
  `,
    ),
  ],
);

export const rounds = pgTable(
  'quiz_rounds',
  {
    playerId: bigint('player_id', { mode: 'number' })
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    mode: roundMode().notNull(),
    nonce: text().notNull(),
    chatId: bigint('chat_id', { mode: 'number' }).notNull(),
    category: text().$type<Category>(),
    questionOrder: text('question_order').array().notNull(),
    answers: jsonb()
      .$type<readonly AnswerResult[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    buttonsUntil: timestamp('buttons_until', { withTimezone: true }).notNull(),
  },
  (row) => [
    primaryKey({ columns: [row.playerId, row.mode] }),
    unique('quiz_round_nonce_key').on(row.nonce),
    check(
      'quiz_round_auth_fields',
      sql`${row.chatId} <> 0 AND ${row.nonce} ~ '^[A-Za-z0-9_-]{16}$'`,
    ),
    check(
      'quiz_round_scope',
      sql`
    (${row.mode} = 'topic' AND ${row.category} IS NOT NULL AND cardinality(${row.questionOrder}) BETWEEN 1 AND 5)
    OR (${row.mode} <> 'topic' AND ${row.category} IS NULL AND cardinality(${row.questionOrder}) BETWEEN 1 AND 100)
  `,
    ),
    check(
      'quiz_round_progress',
      sql`
    jsonb_typeof(${row.answers}) = 'array' AND jsonb_array_length(${row.answers}) <= cardinality(${row.questionOrder})
  `,
    ),
  ],
);

export const unresolved = pgTable(
  'quiz_unresolved',
  {
    playerId: bigint('player_id', { mode: 'number' })
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    questionId: text('question_id').notNull(),
  },
  (row) => [
    primaryKey({ columns: [row.playerId, row.questionId] }),
    check(
      'quiz_unresolved_valid_id',
      sql`${row.questionId} ~ '^[a-z0-9-]{1,32}$'`,
    ),
  ],
);
