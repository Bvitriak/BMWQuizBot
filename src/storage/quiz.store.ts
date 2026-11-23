import { and, eq, gt, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  answer,
  currentId,
  mistakes,
  scoreAnswers,
  zeroScore,
} from '../domain/quiz.engine.ts';
import {
  answerResultSchema,
  categorySchema,
  nonceSchema,
  questionIdSchema,
} from '../domain/quiz.schemas.ts';
import type {
  AnswerResult,
  LeaderboardEntry,
  Question,
  QuizMode,
  QuizSession,
  RoundCallback,
  TopicCallback,
} from '../domain/quiz.types.ts';
import type { CallbackScope } from '../utils/callback.ts';
import type { Database, Transaction } from './database.ts';
import { players, rounds, unresolved } from './schema.ts';

export type RoundChange = {
  session: QuizSession;
  feedback?: { question: Question; result: AnswerResult };
};

export interface QuizStore {
  open(
    scope: CallbackScope,
    fresh: QuizSession,
    restart: boolean,
  ): Promise<QuizSession>;
  openReview(
    scope: CallbackScope,
    nonce: string,
  ): Promise<QuizSession | undefined>;
  issueTopics(scope: CallbackScope, nonce: string): Promise<void>;
  selectTopic(
    scope: CallbackScope,
    payload: TopicCallback,
    fresh: QuizSession,
  ): Promise<QuizSession | undefined>;
  click(
    scope: CallbackScope,
    payload: RoundCallback,
    fresh: (session: QuizSession) => QuizSession,
  ): Promise<RoundChange | undefined>;
  stats(
    userId: number,
  ): Promise<{ entry: LeaderboardEntry; rank: number | undefined }>;
  reset(userId: number): Promise<void>;
}

const stateSchema = z
  .object({
    nonce: nonceSchema,
    chatId: z.int().refine((id) => id !== 0),
    mode: z.enum(['quiz', 'review', 'topic']),
    category: categorySchema.nullable(),
    questionOrder: z.array(questionIdSchema).min(1).max(100),
    answers: z.array(answerResultSchema).max(100),
  })
  .refine(
    ({ questionOrder, answers }) =>
      new Set(questionOrder).size === questionOrder.length &&
      answers.every(({ questionId }, i) => questionOrder[i] === questionId),
  );

export function roundValues(
  userId: number,
  session: QuizSession,
  buttonsUntil: Date,
): typeof rounds.$inferInsert {
  return {
    playerId: userId,
    mode: session.mode,
    nonce: session.nonce,
    chatId: session.chatId,
    category: session.category,
    answers: session.answers,
    questionOrder: [...session.order],
    buttonsUntil,
  };
}

function restore(row: typeof rounds.$inferSelect): QuizSession {
  const { nonce, chatId, mode, category, questionOrder, answers } =
    stateSchema.parse(row);
  return {
    nonce,
    chatId,
    mode,
    category,
    order: questionOrder,
    answers,
    score: scoreAnswers(answers),
  };
}

async function lockPlayer(
  tx: Transaction,
  userId: number,
  create = false,
): Promise<boolean> {
  if (create)
    await tx.insert(players).values({ id: userId }).onConflictDoNothing();
  const [locked] = await tx
    .select({ id: players.id })
    .from(players)
    .where(eq(players.id, userId))
    .for('update');
  return locked !== undefined;
}

export function postgresQuizStore(
  db: Database,
  bank: ReadonlyMap<string, Question>,
  ttlMs: number,
): QuizStore {
  const expires = () => new Date(Date.now() + ttlMs);
  const sameRound = (userId: number, mode: QuizMode) =>
    and(eq(rounds.playerId, userId), eq(rounds.mode, mode));
  const inScope = (row: typeof rounds.$inferSelect, scope: CallbackScope) =>
    row.chatId === scope.chatId &&
    row.questionOrder.every((id) => bank.has(id));

  async function put(
    tx: Transaction,
    userId: number,
    session: QuizSession,
  ): Promise<QuizSession> {
    const values = roundValues(userId, session, expires());
    await tx
      .insert(rounds)
      .values(values)
      .onConflictDoUpdate({
        target: [rounds.playerId, rounds.mode],
        set: values,
      });
    return session;
  }

  async function readRound(tx: Transaction, userId: number, mode: QuizMode) {
    const [row] = await tx.select().from(rounds).where(sameRound(userId, mode));
    return row;
  }

  async function mistakeIds(
    tx: Transaction,
    userId: number,
    eligible: readonly string[],
  ) {
    if (!eligible.length) return [];
    const rows = await tx
      .select({ id: unresolved.questionId })
      .from(unresolved)
      .where(
        and(
          eq(unresolved.playerId, userId),
          inArray(unresolved.questionId, eligible),
        ),
      )
      .orderBy(unresolved.questionId)
      .limit(100);
    return rows.map(({ id }) => id);
  }

  function review(
    tx: Transaction,
    scope: CallbackScope,
    nonce: string,
    ids: readonly string[],
  ) {
    if (!ids.length) return;
    return put(tx, scope.userId, {
      nonce,
      chatId: scope.chatId,
      mode: 'review',
      category: null,
      order: ids,
      answers: [],
      score: zeroScore,
    });
  }

  return {
    open(scope, fresh, restart) {
      return db.transaction(async (tx) => {
        await lockPlayer(tx, scope.userId, true);
        const row = restart
          ? undefined
          : await readRound(tx, scope.userId, fresh.mode);
        const session =
          row && inScope(row, scope)
            ? { ...restore(row), nonce: fresh.nonce }
            : fresh;
        return put(tx, scope.userId, session);
      });
    },
    openReview(scope, nonce) {
      return db.transaction(async (tx) => {
        if (!(await lockPlayer(tx, scope.userId))) return;
        const ids = await mistakeIds(tx, scope.userId, [...bank.keys()]);
        const row = await readRound(tx, scope.userId, 'review');
        if (
          row &&
          inScope(row, scope) &&
          row.answers.length < row.questionOrder.length
        ) {
          const active = restore(row);
          const remaining = active.order
            .slice(active.answers.length)
            .filter((id) => ids.includes(id));
          if (remaining.length) {
            const done = active.order.slice(0, active.answers.length);
            return put(tx, scope.userId, {
              ...active,
              order: [...done, ...remaining],
              nonce,
            });
          }
        }
        return review(tx, scope, nonce, ids);
      });
    },
    issueTopics(scope, nonce) {
      return db.transaction(async (tx) => {
        await lockPlayer(tx, scope.userId, true);
        await tx
          .update(players)
          .set({
            menuNonce: nonce,
            menuChatId: scope.chatId,
            menuUntil: expires(),
          })
          .where(eq(players.id, scope.userId));
      });
    },
    selectTopic(scope, payload, fresh) {
      return db.transaction(async (tx) => {
        if (
          fresh.category !== payload.category ||
          !(await lockPlayer(tx, scope.userId))
        )
          return;
        const used = await tx
          .update(players)
          .set({ menuNonce: null, menuChatId: null, menuUntil: null })
          .where(
            and(
              eq(players.id, scope.userId),
              eq(players.menuNonce, payload.nonce),
              eq(players.menuChatId, scope.chatId),
              gt(players.menuUntil, sql`clock_timestamp()`),
            ),
          )
          .returning({ id: players.id });
        if (!used.length) return;
        const row = await readRound(tx, scope.userId, 'topic');
        const session =
          row?.category === payload.category &&
          inScope(row, scope) &&
          row.answers.length < row.questionOrder.length
            ? { ...restore(row), nonce: fresh.nonce }
            : fresh;
        return put(tx, scope.userId, session);
      });
    },
    click(scope, payload, fresh) {
      return db.transaction(async (tx) => {
        if (!(await lockPlayer(tx, scope.userId))) return;
        const [row] = await tx
          .select()
          .from(rounds)
          .where(
            and(
              eq(rounds.playerId, scope.userId),
              eq(rounds.chatId, scope.chatId),
              eq(rounds.nonce, payload.nonce),
              gt(rounds.buttonsUntil, sql`clock_timestamp()`),
            ),
          );
        if (!row || row.answers.length !== payload.turn || !inScope(row, scope))
          return;
        const session = restore(row);
        const { action } = payload;
        const current = currentId(session);
        if (current === undefined) {
          if (action !== 'r' && action !== 'n') return;
          // The previous results keyboard can only be used once.
          const next = fresh(session);
          const replacement =
            action === 'r'
              ? await review(
                  tx,
                  scope,
                  next.nonce,
                  await mistakeIds(tx, scope.userId, mistakes(session)),
                )
              : await put(tx, scope.userId, next);
          if (!replacement) return;
          if (replacement.mode !== row.mode) {
            await tx
              .update(rounds)
              .set({ buttonsUntil: new Date(0) })
              .where(sameRound(scope.userId, row.mode));
          }
          return { session: replacement };
        }

        if (action === 'r' || action === 'n') return;
        const question = bank.get(current);
        if (!question) return;
        const change = answer(session, question, action);
        if (!change) return;
        const { result } = change;
        await tx
          .update(rounds)
          .set({ answers: change.session.answers, buttonsUntil: expires() })
          .where(sameRound(scope.userId, row.mode));
        if (session.mode !== 'review') {
          const counter = players[result.outcome];
          await tx
            .update(players)
            .set({
              [result.outcome]: sql`least(${counter} + 1, 1000000000)`,
              completed: sql`least(${players.completed} + ${Number(change.finished && session.mode === 'quiz')}, 1000000000)`,
              ranked: true,
            })
            .where(eq(players.id, scope.userId));
        }
        if (result.outcome === 'correct') {
          await tx
            .delete(unresolved)
            .where(
              and(
                eq(unresolved.playerId, scope.userId),
                eq(unresolved.questionId, question.id),
              ),
            );
        } else {
          await tx
            .insert(unresolved)
            .values({ playerId: scope.userId, questionId: question.id })
            .onConflictDoNothing();
        }
        return { session: change.session, feedback: { question, result } };
      });
    },
    async stats(userId) {
      const [row] = await db
        .select({
          correct: players.correct,
          incorrect: players.incorrect,
          skipped: players.skipped,
          completed: players.completed,
          rank: sql<number | null>`case when ${players.ranked} then 1 + (
          select count(*) from quiz_players as higher where higher.ranked and higher.correct > quiz_players.correct
        ) else null end`.mapWith((value: unknown) =>
            value === null ? null : Number(value),
          ),
        })
        .from(players)
        .where(eq(players.id, userId));
      if (!row)
        return { entry: { score: zeroScore, completed: 0 }, rank: undefined };
      const { correct, incorrect, skipped, completed, rank } = row;
      return {
        entry: { score: { correct, incorrect, skipped }, completed },
        rank: rank ?? undefined,
      };
    },
    reset(userId) {
      return db.transaction(async (tx) => {
        if (!(await lockPlayer(tx, userId))) return;
        await tx
          .update(players)
          .set({
            correct: 0,
            incorrect: 0,
            skipped: 0,
            completed: 0,
            ranked: false,
          })
          .where(eq(players.id, userId));
      });
    },
  };
}
