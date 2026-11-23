import type {
  AnswerResult,
  Category,
  Choice,
  Question,
  QuizMode,
  QuizSession,
  Score,
} from './quiz.types.ts';

export const zeroScore: Score = Object.freeze({
  correct: 0,
  incorrect: 0,
  skipped: 0,
});

export function shuffledIds(
  ids: readonly string[],
  nextIndex: (size: number) => number,
): string[] {
  const order = [...new Set(ids)];
  for (let i = order.length - 1; i > 0; i--) {
    const j = nextIndex(i + 1);
    const a = order[i];
    const b = order[j];
    if (
      !Number.isInteger(j) ||
      j < 0 ||
      j > i ||
      a === undefined ||
      b === undefined
    ) {
      throw new RangeError('Invalid shuffle index');
    }
    order[i] = b;
    order[j] = a;
  }
  return order;
}

export function newSession(
  nonce: string,
  chatId: number,
  mode: QuizMode,
  order: readonly string[],
  category: Category | null = null,
): QuizSession {
  return {
    nonce,
    chatId,
    mode,
    category,
    order,
    answers: [],
    score: zeroScore,
  };
}

export function scoreAnswers(answers: readonly AnswerResult[]): Score {
  const score = { ...zeroScore };
  for (const { outcome } of answers) score[outcome]++;
  return score;
}

export function currentId(session: QuizSession): string | undefined {
  return session.order[session.answers.length];
}

export function answer(
  session: QuizSession,
  question: Question,
  choice: Choice,
):
  | { session: QuizSession; result: AnswerResult; finished: boolean }
  | undefined {
  if (currentId(session) !== question.id) return;
  const option = choice === 's' ? null : question.options[choice];
  const outcome =
    option === null ? 'skipped' : option.correct ? 'correct' : 'incorrect';
  const result = {
    questionId: question.id,
    choice,
    outcome,
  } satisfies AnswerResult;
  const answers = [...session.answers, result];
  return {
    result,
    finished: answers.length === session.order.length,
    session: {
      ...session,
      answers,
      score: { ...session.score, [outcome]: session.score[outcome] + 1 },
    },
  };
}

export function mistakes(session: QuizSession): string[] {
  return session.answers
    .filter((result) => result.outcome !== 'correct')
    .map((result) => result.questionId);
}

export function accuracy(score: Score): number {
  const total = score.correct + score.incorrect + score.skipped;
  return total ? Math.round((score.correct / total) * 100) : 0;
}
