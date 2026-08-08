import { EventEmitter } from 'events';
import type { NextApiRequest } from 'next';
import handler from '../../../../pages/api/conversations/[conversationId]/media';
import { createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';

jest.mock('../../../../lib/dashboardSession');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/**
 * `readRawBody` (Fase 1, Bloco F1.3/F1.10) consome `req` como um stream real
 * (`req.on('data'/'end'/'error')` + `req.destroy()`), então o
 * `createFakeReq` genérico (`on: jest.fn()`, não dispara nada) não serve
 * aqui — precisamos de um EventEmitter de verdade para simular os eventos
 * de stream do Node.
 */
function createFakeStreamReq(overrides: {
  method?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
}): NextApiRequest & { destroy: jest.Mock } {
  const emitter = new EventEmitter() as unknown as NextApiRequest & { destroy: jest.Mock };
  emitter.method = overrides.method ?? 'POST';
  emitter.query = overrides.query ?? { conversationId: 'conv-1' };
  emitter.headers = overrides.headers ?? {};
  (emitter as unknown as { destroy: jest.Mock }).destroy = jest.fn();
  return emitter;
}

/**
 * O handler faz `await requireSession(...)` antes de chegar em
 * `readRawBody` (que só ENTÃO registra os listeners de stream) — sem
 * esperar essa microtask esvaziar, um `req.emit('data', ...)` chamado logo
 * após `handler(req, res)` dispara ANTES de existir qualquer listener
 * (EventEmitter não bufferiza, diferente de um stream HTTP real) e o evento
 * se perde, travando o teste. Suficiente esvaziar 2 microtasks (resolução
 * do mock + a continuação do `await`).
 */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('POST /api/conversations/[conversationId]/media (Fase 1, Bloco F1.3/F1.10)', () => {
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

  it('corpo dentro do limite: repassa à API e devolve a resposta upstream', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ id: 'msg-1', contentType: 'image' }),
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
    expect(res._status).toBe(200);
    expect(res._json).toEqual({ id: 'msg-1', contentType: 'image' });
  });

  it('headers de mídia ausentes: 400, nunca chama a API', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const req = createFakeStreamReq({ headers: {} });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('método diferente de POST: 405', async () => {
    const req = createFakeStreamReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._status).toBe(405);
  });

  it('[Fase 1, F1.10] corpo acima do limite (16MB): 413, aborta o stream (req.destroy) e NUNCA chama a API — protege o processo do BFF de bufferizar upload arbitrariamente grande', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const req = createFakeStreamReq({
      headers: { 'content-type': 'image/jpeg', 'x-media-content-type': 'image' },
    });
    const res = createFakeRes();

    const promise = handler(req, res);
    await flushMicrotasks();
    // Um único chunk de 17MB já estoura o teto de 16MB.
    req.emit('data', Buffer.alloc(17 * 1024 * 1024));
    await promise;

    expect(res._status).toBe(413);
    expect(res._json).toMatchObject({ error: 'payload_too_large' });
    expect((req as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('[Fase 1, F1.10] soma de VÁRIOS chunks acima do limite também é rejeitada (não só um chunk único grande)', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const req = createFakeStreamReq({
      headers: { 'content-type': 'image/jpeg', 'x-media-content-type': 'image' },
    });
    const res = createFakeRes();

    const promise = handler(req, res);
    await flushMicrotasks();
    const chunk = Buffer.alloc(9 * 1024 * 1024); // 9MB
    req.emit('data', chunk);
    req.emit('data', chunk); // soma 18MB > 16MB
    await promise;

    expect(res._status).toBe(413);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
