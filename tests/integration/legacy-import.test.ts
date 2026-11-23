import {
  mkdtempDisposable,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { questionIds } from '../../src/data/bmw-questions.ts';
import { newSession } from '../../src/domain/quiz.engine.ts';
import { importLegacy } from '../../src/storage/legacy-import.ts';
import { sessionNonce } from '../../src/utils/callback.ts';
import { clearTestRows, testDatabase, testStore } from './database.ts';

const database = testDatabase();
const store = testStore(database);
beforeEach(clearTestRows);
afterAll(database.close);

describe('users.json import into PostgreSQL', () => {
  it('preserves counters, progress and mistakes without overwriting existing players or the file', async () => {
    await using directory = await mkdtempDisposable(
      join(tmpdir(), 'bmwquiz-import-'),
    );
    const path = join(directory.path, 'users.json');
    const content = JSON.stringify({
      42: {
        stats: { totalCorrect: 7 },
        answers: { 1: { selected: 1, correct: false }, 2: null, 3: true },
        currentQuestion: 4,
      },
      43: {
        stats: { totalSkipped: 10, quizzesCompleted: 1 },
        answers: Object.fromEntries(
          Array.from({ length: 10 }, (_, i) => [i + 1, null]),
        ),
      },
      44: { stats: { totalCorrect: 50 } },
      45: { stats: { totalCorrect: 100 } },
    });
    await writeFile(path, content);
    const scope = (id: number) => ({ userId: id, chatId: id });
    const fresh = (id: number) =>
      newSession(sessionNonce(), id, 'quiz', questionIds);
    await store.open(scope(45), fresh(45), false);
    expect(await importLegacy(database.db, path, questionIds)).toEqual({
      imported: 3,
      skipped: 1,
    });
    expect((await store.stats(42)).entry).toMatchObject({
      score: { correct: 7 },
    });
    expect((await store.stats(44)).entry).toMatchObject({
      score: { correct: 50 },
    });
    expect((await store.stats(45)).entry).toMatchObject({
      score: { correct: 0 },
    });
    const round = await store.open(scope(42), fresh(42), false);
    expect(round.order.slice(0, 4)).toEqual(['1', '2', '3', '4']);
    expect(round.answers).toEqual([
      { questionId: '1', choice: 1, outcome: 'incorrect' },
      { questionId: '2', choice: 's', outcome: 'skipped' },
      { questionId: '3', choice: null, outcome: 'correct' },
    ]);
    expect((await store.openReview(scope(42), sessionNonce()))?.order).toEqual([
      '1',
      '2',
    ]);
    const finished = await store.open(scope(43), fresh(43), false);
    expect(finished.order).toHaveLength(10);
    expect(finished.answers).toHaveLength(10);
    await store.reset(42);
    expect(await importLegacy(database.db, path, questionIds)).toEqual({
      imported: 0,
      skipped: 4,
    });
    expect((await store.stats(42)).entry.score.correct).toBe(0);
    expect(await readFile(path, 'utf8')).toBe(content);
  });

  it('rejects an invalid snapshot as a whole and does not follow symlinks', async () => {
    await using directory = await mkdtempDisposable(
      join(tmpdir(), 'bmwquiz-import-'),
    );
    const path = join(directory.path, 'users.json');
    const link = join(directory.path, 'link.json');
    await writeFile(
      path,
      '{"42":{"stats":{"totalCorrect":7}},"43":{"stats":{"totalCorrect":-1}}}',
    );
    await symlink(path, link);
    await expect(
      importLegacy(database.db, link, questionIds),
    ).rejects.toThrow();
    await expect(
      importLegacy(database.db, path, questionIds),
    ).rejects.toThrow();
    expect((await store.stats(42)).rank).toBeUndefined();
  });
});
