import type { Api } from 'grammy';
import type { Logger } from '../../utils/logger.ts';

export async function acknowledge(
  api: Api,
  callbackId: string,
  log: Logger,
): Promise<void> {
  try {
    await api.answerCallbackQuery(callbackId);
  } catch {
    log('callback_ack_error');
  }
}
