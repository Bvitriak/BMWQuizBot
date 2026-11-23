import { timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Bot } from 'grammy';
import type { Logger } from '../utils/logger.ts';
import { updateSchema } from './middlewares/update.ts';

type Update = Parameters<Bot['handleUpdate']>[0];
const maxBody = 256 * 1024;

function reject(response: ServerResponse, code: number): void {
  response.writeHead(code, { connection: 'close' }).end();
}

async function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  const body: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    if (!Buffer.isBuffer(chunk)) return;
    bytes += chunk.length;
    if (bytes > maxBody) return;
    body.push(chunk);
  }
  return Buffer.concat(body, bytes);
}

export function webhookServer(
  secret: string,
  handle: (update: Update) => Promise<void>,
  log: Logger,
) {
  const expected = Buffer.from(secret);
  let pending = 0;
  const jobs = new Set<Promise<void>>();
  let closing = false;
  let listening: Promise<unknown> | undefined;

  async function dispatch(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (closing) {
      reject(response, 503);
      return;
    }
    if (request.url !== '/telegram') {
      reject(response, 404);
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('allow', 'POST');
      reject(response, 405);
      return;
    }
    const header = request.headers['x-telegram-bot-api-secret-token'];
    const provided =
      typeof header === 'string' && header.length === secret.length
        ? Buffer.from(header)
        : undefined;
    if (
      !provided ||
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      reject(response, 403);
      return;
    }
    if (
      request.headers['content-type']
        ?.split(';', 1)[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    ) {
      reject(response, 415);
      return;
    }
    if (Number(request.headers['content-length']) > maxBody) {
      reject(response, 413);
      return;
    }
    if (pending >= 64) {
      reject(response, 503);
      return;
    }

    pending++;
    try {
      const timeout = setTimeout(() => request.destroy(), 5_000).unref();
      const body = await readBody(request).finally(() => {
        clearTimeout(timeout);
      });
      if (!body) {
        reject(response, 413);
        return;
      }
      let input: unknown;
      try {
        input = JSON.parse(body.toString('utf8'));
      } catch {
        reject(response, 400);
        return;
      }
      const update = updateSchema.safeParse(input);
      if (!update.success) {
        reject(response, 400);
        return;
      }
      try {
        await handle(update.data);
      } catch {
        // Обработчик мог уже принять ответ. Не просим Telegram повторять update.
        log('update_error');
      }
      response.writeHead(200).end();
    } finally {
      pending--;
    }
  }

  const server = createServer(
    {
      maxHeaderSize: 8192,
      headersTimeout: 5_000,
      requestTimeout: 8_000,
      keepAliveTimeout: 2_000,
    },
    (request, response) => {
      const job = dispatch(request, response)
        .catch(() => {
          log('webhook_request_error');
          if (!response.headersSent && !response.destroyed)
            reject(response, 500);
        })
        .finally(() => jobs.delete(job));
      jobs.add(job);
    },
  );
  server.maxConnections = 256;
  server.maxRequestsPerSocket = 100;
  return {
    server,
    async listen(host: string, port: number): Promise<void> {
      listening = once(server, 'listening');
      server.listen({ host, port });
      await listening;
    },
    stop: async (): Promise<void> => {
      closing = true;
      await listening?.catch(() => undefined);
      const closed = new Promise<void>((resolve, fail) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => {
          if (error) fail(error);
          else resolve();
        });
      });
      await Promise.all([closed, ...jobs]);
    },
  };
}
