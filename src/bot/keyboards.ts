import { InlineKeyboard, Keyboard } from 'grammy';
import { accuracy, mistakes } from '../domain/quiz.engine.ts';
import { categoryLabels } from '../domain/quiz.types.ts';
import type {
  AnswerResult,
  Category,
  LeaderboardEntry,
  Question,
  QuizSession,
} from '../domain/quiz.types.ts';
import type { CallbackCodec, CallbackScope } from '../utils/callback.ts';

export const menu = new Keyboard()
  .text('🚀 Start Quiz')
  .row()
  .text('📚 Topics')
  .text('🔁 My Mistakes')
  .row()
  .text('📊 My Stats')
  .text('🆘 Help')
  .resized();
export const statsMenu = new Keyboard()
  .text('🚀 Start Quiz')
  .row()
  .text('🗑️ Reset stats')
  .text('◀️ Main menu')
  .resized();
export const welcome = `🌟 Welcome to the BMW Knowledge Quiz! 🌟

🚗 Level up your BMW knowledge!
1. Answer questions about BMW models and technology.
2. Get an explanation for each answer.
3. Review your mistakes.`;

export const help = `🛠 Help

Choose a, b, c or Skip question using the buttons below each question.
After each answer, you’ll see the result and an explanation.

/start – Main menu
/quiz – Start or resume the quiz
/restart – Start a new quiz
/topics – Choose a five-question topic
/mistakes – Review your unresolved mistakes in a private chat
/stats – Show your statistics in a private chat
/help – This help`;

export function statsText(
  entry: LeaderboardEntry,
  rank: number | undefined,
): string {
  const { score, completed } = entry;
  return `📊 Your all-time statistics:

✅ Correct answers: ${score.correct}
❌ Incorrect answers: ${score.incorrect}
⏩ Skipped questions: ${score.skipped}
🏁 Quizzes completed: ${completed}
📈 Accuracy: ${accuracy(score)}%
🏆 Rank by correct answers: ${rank ?? 'unranked'}`;
}

type View = { text: string; keyboard: InlineKeyboard };

export function topicsView(
  categories: Iterable<Category>,
  codec: CallbackCodec,
  scope: CallbackScope,
  nonce: string,
): View {
  const keyboard = new InlineKeyboard();
  for (const category of categories) {
    keyboard
      .text(categoryLabels[category], codec.encode({ nonce, category }, scope))
      .row();
  }
  return { text: '📚 Choose a topic for a five-question quiz.', keyboard };
}

export function sessionView(
  session: QuizSession,
  question: Question | undefined,
  codec: CallbackCodec,
  scope: CallbackScope,
  questionsById: ReadonlyMap<string, Question>,
  feedback?: { question: Question; result: AnswerResult },
): View {
  const turn = session.answers.length;
  const key = (action: 0 | 1 | 2 | 's' | 'r' | 'n') =>
    codec.encode({ nonce: session.nonce, turn, action }, scope);
  const heading =
    session.mode === 'review'
      ? '🔁 Mistake review'
      : session.category
        ? `📚 ${categoryLabels[session.category]} · Question`
        : '❓ Question';
  const parts = feedback
    ? [feedbackText(feedback.question, feedback.result)]
    : [];
  const keyboard = new InlineKeyboard();
  if (!question) {
    const { correct, incorrect, skipped } = session.score;
    parts.push(
      `${session.mode === 'review' ? '🔁 Mistake review complete!' : '🎉 Quiz complete!'}\n\n` +
        `✅ Correct: ${correct}/${turn} (${accuracy(session.score)}%)\n❌ Incorrect: ${incorrect}\n⏩ Skipped: ${skipped}`,
    );
    if (session.mode === 'quiz') {
      let details = '📝 Detailed results:';
      for (const [index, result] of session.answers.entries()) {
        const item = questionsById.get(result.questionId);
        const correct = item?.options.find((option) => option.correct);
        if (!item || !correct) continue;
        const mark = { correct: '✅', incorrect: '❌', skipped: '⏩' }[
          result.outcome
        ];
        const line = `\n${index + 1}. ${mark} ${item.text} → ${correct.text}`;
        if (details.length + line.length > 2300) {
          details += '\nAdditional results were shown during the quiz.';
          break;
        }
        details += line;
      }
      parts.push(details);
    }
    if (mistakes(session).length) {
      parts.push('📌 Repeat the questions you missed.');
      keyboard.text('🔁 Repeat mistakes', key('r'));
    }
    keyboard.text('🔄 Restart', key('n'));
  } else {
    parts.push(
      `${heading} ${turn + 1}/${session.order.length}:\n${question.text}\n\n` +
        question.options
          .map(({ text }, index) => `${'abc'.charAt(index)}) ${text}`)
          .join('\n'),
    );
    keyboard
      .text('a', key(0))
      .text('b', key(1))
      .text('c', key(2))
      .row()
      .text('Skip question', key('s'));
  }
  return { text: parts.join('\n\n'), keyboard };
}

function feedbackText(question: Question, result: AnswerResult): string {
  if (result.outcome === 'correct')
    return `✅ Correct!\n${question.explanation}`;
  const correct = question.options.find((option) => option.correct);
  const choice =
    result.choice === 's' || result.choice === null
      ? null
      : question.options[result.choice].text;
  const heading =
    result.outcome === 'skipped'
      ? '⏩ Question skipped!'
      : choice === null
        ? '❌ Incorrect!'
        : `❌ Incorrect!\nYou chose: ${choice}`;
  return `${heading}\n✅ Correct answer: ${correct?.text ?? ''}\n\n${question.explanation}`;
}
