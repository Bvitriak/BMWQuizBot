import { randomInt } from 'node:crypto';
import type { Api } from 'grammy';
import {
  TOPIC_SIZE,
  questionIds,
  questionsById,
  topicQuestionIds,
} from '../../data/bmw-questions.ts';
import {
  currentId,
  newSession,
  shuffledIds,
} from '../../domain/quiz.engine.ts';
import type {
  CallbackPayload,
  Category,
  QuizSession,
} from '../../domain/quiz.types.ts';
import type { QuizStore, RoundChange } from '../../storage/quiz.store.ts';
import { sessionNonce } from '../../utils/callback.ts';
import type { CallbackCodec, CallbackScope } from '../../utils/callback.ts';
import { sessionView, topicsView } from '../keyboards.ts';

export function quizHandlers(store: QuizStore, codec: CallbackCodec) {
  function fresh(chatId: number, category?: Category): QuizSession {
    const ids = category ? topicQuestionIds.get(category) : undefined;
    return ids && category
      ? newSession(
          sessionNonce(),
          chatId,
          'topic',
          shuffledIds(ids, randomInt).slice(0, TOPIC_SIZE),
          category,
        )
      : newSession(
          sessionNonce(),
          chatId,
          'quiz',
          shuffledIds(questionIds, randomInt),
        );
  }

  function view({ session, feedback }: RoundChange, scope: CallbackScope) {
    return sessionView(
      session,
      questionsById.get(currentId(session) ?? ''),
      codec,
      scope,
      questionsById,
      feedback,
    );
  }

  async function send(
    api: Api,
    scope: CallbackScope,
    session: QuizSession,
  ): Promise<void> {
    const { text, keyboard } = view({ session }, scope);
    await api.sendMessage(scope.chatId, text, { reply_markup: keyboard });
  }

  return {
    async open(
      api: Api,
      scope: CallbackScope,
      restart: boolean,
    ): Promise<void> {
      await send(
        api,
        scope,
        await store.open(scope, fresh(scope.chatId), restart),
      );
    },
    async mistakes(api: Api, scope: CallbackScope): Promise<void> {
      const review = await store.openReview(scope, sessionNonce());
      if (!review) {
        await api.sendMessage(scope.chatId, 'No mistakes to review yet.');
        return;
      }
      await send(api, scope, review);
    },
    async topics(api: Api, scope: CallbackScope): Promise<void> {
      if (!topicQuestionIds.size) {
        await api.sendMessage(
          scope.chatId,
          'No topics have enough questions yet.',
        );
        return;
      }
      const nonce = sessionNonce();
      await store.issueTopics(scope, nonce);
      const { text, keyboard } = topicsView(
        topicQuestionIds.keys(),
        codec,
        scope,
        nonce,
      );
      await api.sendMessage(scope.chatId, text, { reply_markup: keyboard });
    },
    async click(
      api: Api,
      scope: CallbackScope,
      messageId: number,
      payload: CallbackPayload,
    ): Promise<void> {
      let change: RoundChange | undefined;
      if ('category' in payload) {
        if (!topicQuestionIds.has(payload.category)) return;
        const session = await store.selectTopic(
          scope,
          payload,
          fresh(scope.chatId, payload.category),
        );
        if (session) change = { session };
      } else {
        change = await store.click(scope, payload, (previous) =>
          fresh(scope.chatId, previous.category ?? undefined),
        );
      }
      if (!change) return;
      const { text, keyboard } = view(change, scope);
      await api.editMessageText(scope.chatId, messageId, text, {
        reply_markup: keyboard,
      });
    },
  };
}
