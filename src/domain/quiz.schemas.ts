import { z } from 'zod';
import { categoryLabels } from './quiz.types.ts';
import type { Category } from './quiz.types.ts';

export const questionIdSchema = z.string().regex(/^[a-z0-9-]{1,32}$/);
export const nonceSchema = z.string().regex(/^[A-Za-z0-9_-]{16}$/);
export const categorySchema = z.custom<Category>(
  (value) => typeof value === 'string' && Object.hasOwn(categoryLabels, value),
);
export const choiceSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal('s'),
]);
const outcome = z.enum(['correct', 'incorrect', 'skipped']);
export const answerResultSchema = z
  .strictObject({
    questionId: questionIdSchema,
    choice: choiceSchema.nullable(),
    outcome,
  })
  .refine(
    ({ choice, outcome }) =>
      choice === null || (choice === 's') === (outcome === 'skipped'),
  );
