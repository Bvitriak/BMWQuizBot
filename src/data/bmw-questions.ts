import { z } from 'zod';
import { categorySchema, questionIdSchema } from '../domain/quiz.schemas.ts';
import type { Category, Question } from '../domain/quiz.types.ts';

const option = z.strictObject({
  text: z.string().trim().min(1).max(180),
  correct: z.boolean(),
});
const question = z.strictObject({
  id: questionIdSchema,
  category: categorySchema,
  text: z.string().trim().min(1).max(350),
  options: z
    .tuple([option, option, option])
    .refine((items) => items.filter((item) => item.correct).length === 1),
  explanation: z.string().trim().min(1).max(900),
});
export const questionsSchema = z
  .array(question)
  .min(1)
  .max(100)
  .refine(
    (items) => new Set(items.map(({ id }) => id)).size === items.length,
    'Question IDs must be unique',
  );

const source = [
  {
    id: '1',
    category: 'engines',
    text: 'What is the engine displacement of the 2020 BMW X5 xDrive40i?',
    options: [
      { text: '3.0L', correct: true },
      { text: '2.5L', correct: false },
      { text: '4.0L', correct: false },
    ],
    explanation: 'The X5 xDrive40i uses a turbocharged 3.0-liter inline-six.',
  },
  {
    id: '2',
    category: 'history',
    text: 'Which 3 Series model introduced all-wheel drive in 1985?',
    options: [
      { text: 'BMW 325iX (E30)', correct: true },
      { text: 'BMW X5 (E53)', correct: false },
      { text: 'BMW 750iL (E38)', correct: false },
    ],
    explanation:
      'The E30 325iX introduced all-wheel drive to the 3 Series before BMW used the xDrive name.',
  },
  {
    id: '3',
    category: 'm',
    text: 'Which generation was the first BMW M5 to use M xDrive?',
    options: [
      { text: 'E60', correct: false },
      { text: 'F10', correct: false },
      { text: 'F90', correct: true },
    ],
    explanation:
      'The sixth-generation F90 M5 introduced M xDrive to the M5 line.',
  },
  {
    id: '4',
    category: 'history',
    text: 'In what year did the first BMW 3 Series appear?',
    options: [
      { text: '1975', correct: true },
      { text: '1982', correct: false },
      { text: '1968', correct: false },
    ],
    explanation:
      'The first generation BMW 3 Series (E21) was introduced in 1975.',
  },
  {
    id: '5',
    category: 'history',
    text: "Which BMW won 'World Car of the Year' in 2006?",
    options: [
      { text: 'BMW 3 Series (E90)', correct: true },
      { text: 'BMW X3 (E83)', correct: false },
      { text: 'BMW 7 Series (E65)', correct: false },
    ],
    explanation:
      "The BMW 3 Series (E90) was named 'World Car of the Year' in 2006.",
  },
  {
    id: '6',
    category: 'm',
    text: 'What was the launch output of the BMW M3 Competition (G80) in metric horsepower (PS)?',
    options: [
      { text: '480 PS', correct: false },
      { text: '510 PS', correct: true },
      { text: '450 PS', correct: false },
    ],
    explanation:
      'At launch the 3.0-liter Competition engine was rated at 375 kW (510 PS).',
  },
  {
    id: '7',
    category: 'engines',
    text: 'Which 7 Series model launched with a hybrid powertrain based on a V8?',
    options: [
      { text: 'BMW ActiveHybrid 7 (F04)', correct: true },
      { text: 'BMW 740i (E38)', correct: false },
      { text: 'BMW 760i (E65)', correct: false },
    ],
    explanation:
      'The original ActiveHybrid 7 (F04) paired a twin-turbo V8 with an electric motor.',
  },
  {
    id: '8',
    category: 'm',
    text: 'What type of vehicle is the BMW M 1000 RR?',
    options: [
      { text: 'Touring sedan', correct: false },
      { text: 'Superbike', correct: true },
      { text: 'Adventure SUV', correct: false },
    ],
    explanation:
      'The M 1000 RR is a BMW Motorrad superbike based on the S 1000 RR.',
  },
  {
    id: '9',
    category: 'models',
    text: 'What is the internal code for the eighth-generation BMW 5 Series sedan introduced in 2023?',
    options: [
      { text: 'G60', correct: true },
      { text: 'F10', correct: false },
      { text: 'E39', correct: false },
    ],
    explanation: 'G60 is the sedan code; G61 is the Touring code.',
  },
  {
    id: '10',
    category: 'electric',
    text: 'What feature does the BMW iX Flow with its electrophoretic finish have?',
    options: [
      { text: 'Changes the body shape', correct: false },
      { text: 'Changes the body color', correct: true },
      { text: 'Creates holograms', correct: false },
    ],
    explanation:
      'The BMW iX Flow can change its body color thanks to electrophoretic (E Ink) technology.',
  },
  {
    id: '11',
    category: 'alpina',
    text: 'Which BMW model line was the basis for the ALPINA B7 (G12)?',
    options: [
      { text: 'BMW 5 Series', correct: false },
      { text: 'BMW 7 Series', correct: true },
      { text: 'BMW 8 Series', correct: false },
    ],
    explanation:
      'The G12 ALPINA B7 was based on the long-wheelbase BMW 7 Series sedan.',
  },
  {
    id: '12',
    category: 'm',
    text: 'Which engine configuration did the E60 BMW M5 use?',
    options: [
      { text: 'V8', correct: false },
      { text: 'V10', correct: true },
      { text: 'Inline-six', correct: false },
    ],
    explanation: 'The E60 M5 used the naturally aspirated 5.0-liter S85 V10.',
  },
  {
    id: '13',
    category: 'm',
    text: 'What body style was the BMW M1 (E26)?',
    options: [
      { text: 'Four-door sedan', correct: false },
      { text: 'Station wagon', correct: false },
      { text: 'Mid-engine two-door coupé', correct: true },
    ],
    explanation: 'The BMW M1 was a two-seat, mid-engine sports coupé.',
  },
  {
    id: '14',
    category: 'm',
    text: 'Which platform was used for the first production BMW M3?',
    options: [
      { text: 'E30', correct: true },
      { text: 'E36', correct: false },
      { text: 'E46', correct: false },
    ],
    explanation: 'The first M3 was based on the E30-generation BMW 3 Series.',
  },
  {
    id: '15',
    category: 'history',
    text: 'Which BMW model introduced the New Class sedans?',
    options: [
      { text: 'BMW 1500', correct: true },
      { text: 'BMW 700', correct: false },
      { text: 'BMW 507', correct: false },
    ],
    explanation:
      'The BMW 1500 was the first New Class sedan, unveiled in Frankfurt in 1961.',
  },
  {
    id: '16',
    category: 'history',
    text: 'Which BMW model used a front-opening door for access?',
    options: [
      { text: 'BMW 2002', correct: false },
      { text: 'BMW Isetta', correct: true },
      { text: 'BMW Z1', correct: false },
    ],
    explanation: 'The BMW Isetta microcar had a single front door.',
  },
];

export const questions: readonly Question[] = questionsSchema.parse(source);
export const questionsById: ReadonlyMap<string, Question> = new Map(
  questions.map((item) => [item.id, item]),
);
export const questionIds: readonly string[] = [...questionsById.keys()];

export const TOPIC_SIZE = 5;
const grouped = new Map<Category, string[]>();
for (const { category, id } of questions) {
  const ids = grouped.get(category);
  if (ids) ids.push(id);
  else grouped.set(category, [id]);
}
export const topicQuestionIds: ReadonlyMap<Category, readonly string[]> =
  new Map([...grouped].filter(([, ids]) => ids.length >= TOPIC_SIZE));
