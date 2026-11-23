export interface QuestionOption {
  readonly text: string;
  readonly correct: boolean;
}

export interface Question {
  readonly id: string;
  readonly category: Category;
  readonly text: string;
  readonly options: readonly [QuestionOption, QuestionOption, QuestionOption];
  readonly explanation: string;
}

export const categoryLabels = {
  models: 'Models & chassis',
  engines: 'Engines',
  history: 'History',
  m: 'BMW M',
  electric: 'BMW i',
  alpina: 'ALPINA',
} as const;

export type Category = keyof typeof categoryLabels;
export type Choice = 0 | 1 | 2 | 's';
export type QuizMode = 'quiz' | 'review' | 'topic';
export type Outcome = 'correct' | 'incorrect' | 'skipped';

export interface AnswerResult {
  readonly questionId: string;
  readonly choice: Choice | null;
  readonly outcome: Outcome;
}

export interface Score {
  readonly correct: number;
  readonly incorrect: number;
  readonly skipped: number;
}

export interface QuizSession {
  readonly nonce: string;
  readonly chatId: number;
  readonly mode: QuizMode;
  readonly category: Category | null;
  readonly order: readonly string[];
  readonly answers: readonly AnswerResult[];
  readonly score: Score;
}

export interface LeaderboardEntry {
  readonly score: Score;
  readonly completed: number;
}

export type RoundAction = Choice | 'r' | 'n';

export interface RoundCallback {
  readonly nonce: string;
  readonly turn: number;
  readonly action: RoundAction;
}

export interface TopicCallback {
  readonly nonce: string;
  readonly category: Category;
}

export type CallbackPayload = RoundCallback | TopicCallback;
