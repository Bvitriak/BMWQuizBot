import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { newSession } from '../../src/domain/quiz.engine.ts';
import { sessionNonce } from '../../src/utils/callback.ts';
import {
  clearTestRows,
  testDatabase,
  testMigrator,
  testStore,
} from './database.ts';

const database = testDatabase();
const store = testStore(database);
const scope = { userId: 42, chatId: 42 };
const fresh = () => newSession(sessionNonce(), scope.chatId, 'quiz', ['1']);

beforeEach(clearTestRows);
afterAll(database.close);

describe('transactional quiz storage', () => {
  it('counts a concurrent answer only once across independent pools', async () => {
    const another = testDatabase();
    try {
      const { nonce } = await store.open(scope, fresh(), false);
      const payload = { nonce, turn: 0, action: 0 } as const;
      const results = await Promise.all([
        store.click(scope, payload, fresh),
        testStore(another).click(scope, payload, fresh),
      ]);
      expect(results.filter((value) => value !== undefined)).toHaveLength(1);
      expect((await store.stats(scope.userId)).entry).toEqual({
        score: { correct: 1, incorrect: 0, skipped: 0 },
        completed: 1,
      });
      expect(
        (await testStore(another).open(scope, fresh(), false)).answers,
      ).toHaveLength(1);
    } finally {
      await another.close();
    }
  });

  it('rolls back the round and score if recording an unresolved answer fails', async () => {
    const migrator = testMigrator();
    try {
      await migrator.db.execute(
        sql`alter table quiz_unresolved add constraint test_failure check (question_id <> '1')`,
      );
      const { nonce } = await store.open(scope, fresh(), false);
      const payload = { nonce, turn: 0, action: 's' } as const;
      await expect(store.click(scope, payload, fresh)).rejects.toThrow();
      expect(await store.stats(scope.userId)).toEqual({
        entry: {
          score: { correct: 0, incorrect: 0, skipped: 0 },
          completed: 0,
        },
        rank: undefined,
      });
      expect(await store.openReview(scope, sessionNonce())).toBeUndefined();
      await migrator.db.execute(
        sql`alter table quiz_unresolved drop constraint test_failure`,
      );
      expect(
        (await store.click(scope, payload, fresh))?.session.answers,
      ).toHaveLength(1);
    } finally {
      await migrator.db.execute(
        sql`alter table quiz_unresolved drop constraint if exists test_failure`,
      );
      await migrator.close();
    }
  });

  it('rejects expired buttons but resumes the stored progress', async () => {
    const first = newSession(sessionNonce(), scope.chatId, 'quiz', ['1', '2']);
    await store.open(scope, first, false);
    await store.click(scope, { nonce: first.nonce, turn: 0, action: 0 }, fresh);
    await database.db.execute(
      sql`update quiz_rounds set buttons_until = clock_timestamp() - interval '1 second'`,
    );
    expect(
      await store.click(
        scope,
        { nonce: first.nonce, turn: 1, action: 0 },
        fresh,
      ),
    ).toBeUndefined();
    expect(await store.open(scope, fresh(), false)).toMatchObject({
      order: ['1', '2'],
      answers: [{ questionId: '1', outcome: 'correct' }],
    });
  });

  it('drops a pending review question already answered correctly in the full quiz', async () => {
    const makeRound = () =>
      newSession(sessionNonce(), scope.chatId, 'quiz', ['1', '2']);
    const first = await store.open(scope, makeRound(), true);
    await store.click(
      scope,
      { nonce: first.nonce, turn: 0, action: 's' },
      makeRound,
    );
    await store.click(
      scope,
      { nonce: first.nonce, turn: 1, action: 's' },
      makeRound,
    );
    expect((await store.openReview(scope, sessionNonce()))?.order).toEqual([
      '1',
      '2',
    ]);
    const second = await store.open(scope, makeRound(), true);
    await store.click(
      scope,
      { nonce: second.nonce, turn: 0, action: 0 },
      makeRound,
    );
    expect((await store.openReview(scope, sessionNonce()))?.order).toEqual([
      '2',
    ]);
  });

  it('ranks tied scores equally and refuses DDL for the application role', async () => {
    for (const [id, action] of [
      [1, 0],
      [2, 0],
      [3, 's'],
    ] as const) {
      const player = { userId: id, chatId: id };
      const { nonce } = await store.open(
        player,
        newSession(sessionNonce(), id, 'quiz', ['1']),
        false,
      );
      await store.click(player, { nonce, turn: 0, action }, fresh);
    }
    const ranks = await Promise.all([1, 2, 3, 4].map((id) => store.stats(id)));
    expect(ranks.map(({ rank }) => rank)).toEqual([1, 1, 3, undefined]);
    await expect(
      database.db.execute(sql`create table test_forbidden (id integer)`),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});
