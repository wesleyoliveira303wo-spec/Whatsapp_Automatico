import { EventEmitter } from 'events';
import type { NextApiRequest } from 'next';
import handler from '../../../../pages/api/contacts/import';
import { createFakeRes } from '../../../testDoubles';
import { requireSession } from '../../../../lib/dashboardSession';

jest.mock('../../../../lib/dashboardSession');

const SESSION = { tenantId: 'tenant-1', apiKey: 'chave' };

/**
 * `readRawBody` consome `req` como stream real — mesmo motivo/técnica de
 * `tests/pages/api/conversations/media.test.ts` (Fase 1, Bloco F1.3/F1.10),
 * adaptado para o corpo TEXTO do CSV em vez de binário.
 */
function createFakeStreamReq(overrides: { method?: string }): NextApiRequest & {
  destroy: jest.Mock;
} {
  const emitter = new EventEmitter() as unknown as NextApiRequest & { destroy: jest.Mock };
  emitter.method = overrides.method ?? 'POST';
  emitter.query = {};
  emitter.headers = {};
  (emitter as unknown as { destroy: jest.Mock }).destroy = jest.fn();
  return emitter;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('POST /api/contacts/import (Fase L, Bloco L1b)', () => {
  const originalFetch = global.fetch;
  const originalApiBaseUrl = process.env.API_BASE_URL;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.API_BASE_URL = 'http://api-de-teste:4000';
    (requireSession as jest.Mock).mockResolvedValue(SESSION);
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.API_BASE_URL = originalApiBaseUrl;
  });

  it('corpo dentro do limite: repassa o CSV cru à API (Content-Type text/csv) e devolve o relatório', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      text: async () => JSON.stringify({ totalRows: 1, created: 1, enriched: 0, unchanged: 0, invalid: [] }),
    }) as unknown as typeof fetch;

    const req = createFakeStreamReq({});
    const res = createFakeRes();

    const promise = handler(req, res);
    await flushMicrotasks();
    req.emit('data', Buffer.from('Nome,Telefone\nMaria,5521988887777'));
    req.emit('end');
    await promise;

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(String(url)).toBe('http://api-de-teste:4000/api/tenants/tenant-1/contacts/import');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/csv');
    expect(Buffer.from(init.body).toString('utf-8')).toBe('Nome,Telefone\nMaria,5521988887777');
    expect(res._status).toBe(200);
    expect(res._json).toMatchObject({ totalRows: 1, created: 1 });
  });

  it('método diferente de POST: 405, nunca chama a API', async () => {
    const req = createFakeStreamReq({ method: 'GET' });
    const res = createFakeRes();

    await handler(req, res);

    expect(res._status).toBe(405);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('corpo acima do limite (5MB): 413, aborta o stream e nunca chama a API', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    const req = createFakeStreamReq({});
    const res = createFakeRes();

    const promise = handler(req, res);
    await flushMicrotasks();
    req.emit('data', Buffer.alloc(6 * 1024 * 1024));
    await promise;

    expect(res._status).toBe(413);
    expect(res._json).toMatchObject({ error: 'payload_too_large' });
    expect((req as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('erro de negócio da API passa intacto (403 sem contact:manage)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 403,
      text: async () => JSON.stringify({ error: 'forbidden' }),
    }) as unknown as typeof fetch;
    const req = createFakeStreamReq({});
    const res = createFakeRes();

    const promise = handler(req, res);
    await flushMicrotasks();
    req.emit('data', Buffer.from('Nome,Telefone\nMaria,5521988887777'));
    req.emit('end');
    await promise;

    expect(res._status).toBe(403);
    expect(res._json).toEqual({ error: 'forbidden' });
  });
});
