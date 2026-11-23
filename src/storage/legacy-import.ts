import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { z } from 'zod';
import { newSession, scoreAnswers } from '../domain/quiz.engine.ts';
import { questionIdSchema } from '../domain/quiz.schemas.ts';
import type { AnswerResult, QuizSession } from '../domain/quiz.types.ts';
import { sessionNonce } from '../utils/callback.ts';
import type { Database } from './database.ts';
import { roundValues } from './quiz.store.ts';
import { players, rounds, unresolved } from './schema.ts';

const fileLimit = 32 * 1024 * 1024;
const count = z.int().min(0).max(1_000_000_000).default(0);
const legacyAnswer = z.union([
  z.boolean(),
  z.null(),
  z.object({
    selected: z.union([z.literal(0), z.literal(1), z.literal(2)]).nullish(),
    correct: z.boolean().nullable(),
  }),
]);
const legacyQuestionId = z
  .union([questionIdSchema, z.int().positive().transform(String)])
  .pipe(questionIdSchema);
const legacyUser = z.object({
  stats: z
    .object({
      totalCorrect: count,
      totalIncorrect: count,
      totalSkipped: count,
      quizzesCompleted: count,
    })
    .default({
      totalCorrect: 0,
      totalIncorrect: 0,
      totalSkipped: 0,
      quizzesCompleted: 0,
    }),
  answers: z.record(questionIdSchema, legacyAnswer).default({}),
  currentQuestion: legacyQuestionId.nullish(),
  incorrectQuestions: z.array(legacyQuestionId).max(1000).default([]),
});
const legacyFile = z.record(
  z
    .string()
    .regex(/^[1-9][0-9]{0,15}$/)
    .refine((id) => Number.isSafeInteger(Number(id))),
  legacyUser,
);
const originalIds = Array.from({ length: 10 }, (_, i) => String(i + 1));

async function readSnapshot(path: string): Promise<unknown> {
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > fileLimit)
      throw new Error('Invalid legacy file');
    const buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await file.read(
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size)
      throw new Error('Legacy file changed while reading');
    const payload: unknown = JSON.parse(buffer.toString('utf8', 0, offset));
    return payload;
  } finally {
    await file.close();
  }
}

function normalize(
  id: number,
  old: z.output<typeof legacyUser>,
  bank: ReadonlySet<string>,
) {
  const answers: AnswerResult[] = [];
  for (const [questionId, value] of Object.entries(old.answers)) {
    if (!bank.has(questionId)) continue;
    const correct =
      value !== null && typeof value === 'object' ? value.correct : value;
    const selected =
      value !== null && typeof value === 'object' ? value.selected : null;
    answers.push({
      questionId,
      outcome: correct === null ? 'skipped' : correct ? 'correct' : 'incorrect',
      choice: correct === null ? 's' : (selected ?? null),
    });
  }
  const mistakes = new Set(
    old.incorrectQuestions.filter((questionId) => bank.has(questionId)),
  );
  for (const { questionId, outcome } of answers) {
    if (outcome !== 'correct') mistakes.add(questionId);
  }
  const pending =
    old.currentQuestion && bank.has(old.currentQuestion)
      ? [old.currentQuestion]
      : [];
  const answered = answers.map(({ questionId }) => questionId);
  const previousComplete =
    pending.length === 0 &&
    originalIds.every((questionId) => Object.hasOwn(old.answers, questionId));
  let session: QuizSession | undefined;
  if (answered.length || pending.length) {
    const order = [
      ...new Set([...answered, ...pending, ...(previousComplete ? [] : bank)]),
    ];
    session = {
      ...newSession(sessionNonce(), id, 'quiz', order),
      answers,
      score: scoreAnswers(answers),
    };
  }
  const {
    totalCorrect: correct,
    totalIncorrect: incorrect,
    totalSkipped: skipped,
    quizzesCompleted: completed,
  } = old.stats;
  return {
    player: {
      id,
      correct,
      incorrect,
      skipped,
      completed,
      ranked: correct + incorrect + skipped + completed > 0,
    },
    mistakes,
    session,
  };
}

export async function importLegacy(
  db: Database,
  path: string,
  questionIds: readonly string[],
) {
  const parsed = legacyFile.parse(await readSnapshot(path));
  const rows = Object.entries(parsed);
  if (rows.length > 100_000) throw new Error('Too many legacy players');
  const bank = new Set(questionIds);
  return db.transaction(async (tx) => {
    let imported = 0;
    for (let offset = 0; offset < rows.length; offset += 200) {
      const batch = rows
        .slice(offset, offset + 200)
        .map(([id, value]) => normalize(Number(id), value, bank));
      const inserted = await tx
        .insert(players)
        .values(batch.map(({ player }) => player))
        .onConflictDoNothing()
        .returning({ id: players.id });
      const ids = new Set(inserted.map(({ id }) => id));
      imported += ids.size;
      const newPlayers = batch.filter(({ player }) => ids.has(player.id));
      const progress = newPlayers.flatMap(({ player, session }) =>
        session ? [roundValues(player.id, session, new Date(0))] : [],
      );
      const mistakes = newPlayers.flatMap(({ player, mistakes }) =>
        [...mistakes].map((questionId) => ({
          playerId: player.id,
          questionId,
        })),
      );
      if (progress.length) await tx.insert(rounds).values(progress);
      if (mistakes.length) await tx.insert(unresolved).values(mistakes);
    }
    return { imported, skipped: rows.length - imported };
  });
}
