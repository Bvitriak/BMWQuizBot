import { describe, expect, it } from 'vitest';
import {
  questionIds,
  questions,
  questionsSchema,
} from '../src/data/bmw-questions.ts';
import {
  accuracy,
  answer,
  currentId,
  mistakes,
  newSession,
  shuffledIds,
} from '../src/domain/quiz.engine.ts';

describe('quiz engine', () => {
  it('shuffles without duplicates or mutating the input', () => {
    const ids = ['a', 'b', 'a', 'c'];
    expect(shuffledIds(ids, () => 0)).toEqual(['b', 'c', 'a']);
    expect(ids).toEqual(['a', 'b', 'a', 'c']);
    expect(() => shuffledIds(questionIds, (size) => size)).toThrow(RangeError);
  });

  it('rejects invalid questions before indexing', () => {
    const [item] = questions;
    if (!item) throw new Error('Missing question fixture');
    expect(questionsSchema.safeParse([item, item]).success).toBe(false);
    expect(
      questionsSchema.safeParse([
        {
          ...item,
          options: item.options.map((option) => ({ ...option, correct: true })),
        },
      ]).success,
    ).toBe(false);
  });

  it('counts correct, incorrect and skipped and ends after the last question', () => {
    const [first, second, third] = questions;
    if (!first || !second || !third)
      throw new Error('Missing question fixtures');
    const session = newSession('round', 1, 'quiz', [
      first.id,
      second.id,
      third.id,
    ]);
    expect(answer(session, second, 0)).toBeUndefined();
    expect(currentId(session)).toBe(first.id);
    const correct = answer(session, first, 0);
    if (!correct) throw new Error('Expected an answer');
    const incorrect = answer(correct.session, second, 1);
    if (!incorrect) throw new Error('Expected an answer');
    const skipped = answer(incorrect.session, third, 's');
    if (!skipped) throw new Error('Expected an answer');
    expect([correct.finished, incorrect.finished, skipped.finished]).toEqual([
      false,
      false,
      true,
    ]);
    expect(skipped.session.score).toEqual({
      correct: 1,
      incorrect: 1,
      skipped: 1,
    });
    expect(mistakes(skipped.session)).toEqual([second.id, third.id]);
    expect(accuracy(skipped.session.score)).toBe(33);
    expect(accuracy(session.score)).toBe(0);
    expect(answer(skipped.session, third, 0)).toBeUndefined();
  });
});
