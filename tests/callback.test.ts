import { describe, expect, it } from 'vitest';
import {
  createCallbackCodec,
  isCallbackSize,
  sessionNonce,
} from '../src/utils/callback.ts';

const codec = createCallbackCodec(Buffer.alloc(32, 1));
const scope = { userId: 123, chatId: -456 };
const payload = { nonce: sessionNonce(), turn: 9999, action: 2 } as const;

describe('callback codec', () => {
  it('uses a byte limit, not a character limit', () => {
    expect(isCallbackSize('')).toBe(false);
    expect(isCallbackSize('é'.repeat(32))).toBe(true);
    expect(isCallbackSize(`${'é'.repeat(32)}x`)).toBe(false);
    expect(isCallbackSize('x'.repeat(64))).toBe(true);
  });

  it('signs valid callbacks bound to a user and chat', () => {
    const data = codec.encode(payload, scope);
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64);
    expect(codec.decode(data, scope)).toEqual(payload);
    expect(codec.decode(data, { ...scope, userId: 789 })).toBeUndefined();
    expect(codec.decode(data, { ...scope, chatId: -789 })).toBeUndefined();
    expect(
      codec.decode(data.replace('.9999.2.', '.9999.1.'), scope),
    ).toBeUndefined();
    expect(
      createCallbackCodec(Buffer.alloc(32, 2)).decode(data, scope),
    ).toBeUndefined();
  });

  it.each([null, {}, 'é'.repeat(33), '1.a.0.2.invalid', '0.a.0.2.invalid'])(
    'rejects invalid wire input %j',
    (data) => {
      expect(codec.decode(data, scope)).toBeUndefined();
    },
  );

  it('rejects invalid outbound fields', () => {
    expect(() => codec.encode({ ...payload, turn: 10000 }, scope)).toThrow();
    expect(() => codec.encode({ ...payload, nonce: 'short' }, scope)).toThrow();
  });
});
