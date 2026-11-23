import { z } from 'zod';
import type { IncomingMessage } from '../middlewares/update.ts';

const commandSchema = z
  .string()
  .regex(
    /^\/(?:start|quiz|restart|stats|help|topics|mistakes)(?:@[A-Za-z0-9_]{5,32})?$/i,
  );
const startPayload = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export function commandAction(
  message: IncomingMessage,
  botUsername: string | undefined,
) {
  const entity = message.entities?.find(
    ({ type, offset }) => type === 'bot_command' && offset === 0,
  );
  if (entity && entity.length <= message.text.length) {
    const command = commandSchema.safeParse(
      message.text.slice(0, entity.length),
    );
    const tail = message.text.slice(entity.length);
    if (!command.success || (tail && !/^\s/u.test(tail))) return;
    const [name, target] = command.data.toLowerCase().split('@');
    if (target && target !== botUsername?.toLowerCase()) return;
    const payload = tail.trim();
    if (
      payload &&
      (name !== '/start' || !startPayload.safeParse(payload).success)
    )
      return;
    switch (name) {
      case '/start':
        return 'menu';
      case '/quiz':
        return 'quiz';
      case '/restart':
        return 'restart';
      case '/stats':
        return 'stats';
      case '/topics':
        return 'topics';
      case '/mistakes':
        return 'mistakes';
      case '/help':
        return 'help';
    }
  }
  switch (message.text) {
    case '◀️ Main menu':
      return 'menu';
    case '🚀 Start Quiz':
      return 'quiz';
    case '🔄 Restart':
      return 'restart';
    case '📊 My Stats':
      return 'stats';
    case '📚 Topics':
      return 'topics';
    case '🔁 My Mistakes':
      return 'mistakes';
    case '🆘 Help':
      return 'help';
    case '🗑️ Reset stats':
      return 'resetStats';
    default:
      return;
  }
}
