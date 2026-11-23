import { z } from 'zod';

export const positiveId = z.int().positive();
export const botInfoSchema = z.object({
  id: positiveId,
  is_bot: z.literal(true),
  username: z.string().regex(/^[A-Za-z0-9_]{5,32}$/),
});
const actor = z.object({ id: positiveId, is_bot: z.literal(false) });
const chat = z.object({
  id: z.int().refine((id) => id !== 0),
  type: z.enum(['private', 'group', 'supergroup']),
});
const callbackId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const messageRef = z.object({ message_id: positiveId, chat, date: positiveId });
const callback = z.object({
  id: callbackId,
  from: actor,
  data: z.string().min(1).max(64),
  message: messageRef,
});
const message = messageRef.extend({
  from: actor,
  text: z.string().max(4096),
  entities: z
    .array(
      z.object({
        type: z.string().max(32),
        offset: z.int().nonnegative(),
        length: positiveId,
      }),
    )
    .max(4096)
    .optional(),
});
export const updateSchema = z
  .object({ update_id: z.int().nonnegative() })
  .loose();
export const ackSchema = z.object({ id: callbackId });

export function readMessage(input: unknown) {
  const result = message.safeParse(input);
  return result.success ? result.data : undefined;
}

export function readCallback(input: unknown) {
  const result = callback.safeParse(input);
  return result.success ? result.data : undefined;
}

export type IncomingMessage = z.output<typeof message>;
