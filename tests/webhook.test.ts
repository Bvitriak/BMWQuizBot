import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { webhookServer } from '../src/bot/webhook.ts';

describe('Telegram webhook', () => {
  it('drains an accepted update before stopping', async () => {
    const entered = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    const sequence: string[] = [];
    const secret = 's'.repeat(43);
    const endpoint = webhookServer(
      secret,
      async () => {
        entered.resolve(undefined);
        await release.promise;
        sequence.push('handled');
      },
      vi.fn(),
    );
    await endpoint.listen('127.0.0.1', 0);
    try {
      const address = endpoint.server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing webhook address');
      const request = fetch(`http://127.0.0.1:${address.port}/telegram`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-telegram-bot-api-secret-token': secret,
        },
        body: '{"update_id":1}',
      });
      await entered.promise;
      const stopped = endpoint.stop().then(() => sequence.push('stopped'));
      release.resolve(undefined);
      expect((await request).status).toBe(200);
      await stopped;
      expect(sequence).toEqual(['handled', 'stopped']);
    } finally {
      release.resolve(undefined);
      await endpoint.stop();
    }
  });

  it('rejects invalid requests and acknowledges authenticated valid updates', async () => {
    const handle = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const log = vi.fn();
    const secret = 't'.repeat(43);
    const { server, stop } = webhookServer(secret, handle, log);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing webhook address');
      const root = `http://127.0.0.1:${address.port}`;
      const post = (
        body: string,
        token = secret,
        contentType = 'application/json',
      ) =>
        fetch(`${root}/telegram`, {
          method: 'POST',
          headers: {
            'content-type': contentType,
            'x-telegram-bot-api-secret-token': token,
          },
          body,
        });
      expect((await fetch(`${root}/wrong`)).status).toBe(404);
      expect((await fetch(`${root}/telegram`)).status).toBe(405);
      expect((await post('{"update_id":1}', 'bad')).status).toBe(403);
      expect((await post('{"update_id":1}', 'u'.repeat(43))).status).toBe(403);
      expect((await post('{}', secret, 'text/plain')).status).toBe(415);
      expect((await post(' '.repeat(262145))).status).toBe(413);
      expect((await post('{broken')).status).toBe(400);
      expect((await post('{"update_id":"1"}')).status).toBe(400);
      expect(handle).not.toHaveBeenCalled();
      expect((await post('{"update_id":1}')).status).toBe(200);
      expect(handle).toHaveBeenCalledExactlyOnceWith({ update_id: 1 });
      handle.mockRejectedValueOnce(new Error('private error'));
      expect((await post('{"update_id":2}')).status).toBe(200);
      expect(log).toHaveBeenCalledExactlyOnceWith('update_error');
    } finally {
      await stop();
    }
  });
});
