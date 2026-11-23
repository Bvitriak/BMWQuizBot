import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CallbackPayload } from '../domain/quiz.types.ts';
import {
  categorySchema,
  choiceSchema,
  nonceSchema,
} from '../domain/quiz.schemas.ts';

export const CALLBACK_MAX_BYTES = 64;
const payloadSchema = z.union([
  z.strictObject({
    nonce: nonceSchema,
    turn: z.int().min(0).max(9999),
    action: z.union([choiceSchema, z.enum(['r', 'n'])]),
  }),
  z.strictObject({ nonce: nonceSchema, category: categorySchema }),
]);
const encodedSchema = z.tuple([
  z.literal('1'),
  nonceSchema,
  z.string().regex(/^(?:0|[1-9][0-9]{0,3}|[a-z]{1,8})$/),
  z.enum(['0', '1', '2', 's', 'r', 'n', 't']),
  z.string().regex(/^[A-Za-z0-9_-]{22}$/),
]);
const wireSchema = z
  .string()
  .min(1)
  .max(CALLBACK_MAX_BYTES)
  .refine(isCallbackSize);

export function isCallbackSize(value: string): boolean {
  const bytes = Buffer.byteLength(value);
  return bytes > 0 && bytes <= CALLBACK_MAX_BYTES;
}

export function sessionNonce(): string {
  return randomBytes(12).toString('base64url');
}

export interface CallbackScope {
  readonly userId: number;
  readonly chatId: number;
}

export function createCallbackCodec(key = randomBytes(32)) {
  function tag(body: string, { userId, chatId }: CallbackScope) {
    return createHmac('sha256', key)
      .update(`bmwquiz:v1:${userId}:${chatId}:${body}`)
      .digest()
      .subarray(0, 16)
      .toString('base64url');
  }

  return {
    encode(payload: CallbackPayload, scope: CallbackScope): string {
      const parsed = payloadSchema.parse(payload);
      const body =
        'category' in parsed
          ? `1.${parsed.nonce}.${parsed.category}.t`
          : `1.${parsed.nonce}.${parsed.turn}.${parsed.action}`;
      return wireSchema.parse(`${body}.${tag(body, scope)}`);
    },
    decode(data: unknown, scope: CallbackScope): CallbackPayload | undefined {
      const wire = wireSchema.safeParse(data);
      if (!wire.success) return;
      const parsed = encodedSchema.safeParse(wire.data.split('.'));
      if (!parsed.success) return;
      const [version, nonce, value, action, signature] = parsed.data;
      const expected = tag(`${version}.${nonce}.${value}.${action}`, scope);
      if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
        return;
      if (action === 't') {
        const category = categorySchema.safeParse(value);
        return category.success
          ? { nonce, category: category.data }
          : undefined;
      }
      if (!/^(?:0|[1-9][0-9]{0,3})$/.test(value)) return;
      return {
        nonce,
        turn: Number(value),
        action:
          action === '0' ? 0 : action === '1' ? 1 : action === '2' ? 2 : action,
      };
    },
  };
}

export type CallbackCodec = ReturnType<typeof createCallbackCodec>;
