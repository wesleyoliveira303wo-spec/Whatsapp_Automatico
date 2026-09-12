import { EventEmitter } from 'events';
import type { NextApiRequest } from 'next';
import handler from '../../../../pages/api/group-broadcasts/[broadcastId]/media';
import { createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';

jest.mock('../../../../lib/dashboardSession');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/** Mesmo motivo/mesma técnica de `conversations/[conversationId]/media.test.ts`. */
function createFakeStreamReq(overrides: {
  method?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): NextApiRequest & { destroy: jest.Mock } {
  const emitter = new EventEmitter() as unknown as NextApiRequest & { destroy: jest.Mock };
  emitter.method = overrides.method ?? 'POST';
  emitter.query = overrides.query ?? { broadcastId: 'b1' };
  emitter.headers = overrides.headers ?? {};
  (emitter as unknown as { destroy: jest.Mock }).destroy = jest.fn();
  return emitter;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('proxy /api/group-broadcasts/[broadcastId]/media', () => {
  const originalFetch = global.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.API_BASE_URL = originalApiBaseUrl;
  });

  it('POST dentro do limite: repassa à API e devolve a resposta upstream', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ broadcast: { id: 'b1', media: { contentType: 'image' } } }),
    }) as unknown as typeof fetch;

    const req = createFakeStreamReq({
      headers: { 'content-type': 'image/jpeg', 'x-media-content-type': 'image' },
    });
    const res = createFakeRes();

    const promise = handler(req, res);
    await flushMicrotasks();
    req.emit('data', Buffer.from('bytes-da-imagem'));
    req.emit('end');
    await promise;

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe(
      'http://api-de-teste:4000/api/tenants/tenant-1/group-broadcasts/b1/media',
    );
    expect(res._status).toBe(200);
  });

  it('headers de mídia ausentes: 400, nunca chama a API', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const req = createFakeStreamReq({ headers: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('corpo acima do limite (16MB): 413, aborta o stream e nunca chama a API', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const req = createFakeStreamReq({
      headers: { 'content-type': 'video/mp4', 'x-media-content-type': 'video' },
    });
    const res = createFakeRes();

    const promise = handler(req, res);
    await flushMicrotasks();
    req.emit('data', Buffer.alloc(17 * 1024 * 1024));
    await promise;

    expect(res._status).toBe(413);
    expect(res._json).toMatchObject({ error: 'payload_too_large' });
    expect((req as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('GET faz streaming do binário com o Content-Type da API', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'image/jpeg']]),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }) as unknown as typeof fetch;
    const req = createFakeStreamReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res._sent).toEqual(Buffer.from([1, 2, 3]));
  });

  it('DELETE repassa via callGroupBroadcastsApi', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ broadcast: { id: 'b1' } }),
    }) as unknown as typeof fetch;
    const req = createFakeStreamReq({ method: 'DELETE' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._status).toBe(200);
  });
});
