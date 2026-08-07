import { Request, Response } from 'express';
import { requireInternalSecret } from '../../../src/shared/presentation/requireInternalSecret';

function buildResponse(): Response & { statusCode?: number; body?: unknown } {
  const res: Partial<Response> & { statusCode?: number; body?: unknown } = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn().mockImplementation((body: unknown) => {
    res.body = body;
    return res;
  }) as unknown as Response['json'];
  return res as Response & { statusCode?: number; body?: unknown };
}

function buildRequest(headerValue: string | undefined): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === 'x-internal-secret' ? headerValue : undefined,
  } as unknown as Request;
}

describe('requireInternalSecret (Fase 1, Bloco F1.2)', () => {
  it('segredo correto: chama next() e não escreve resposta', () => {
    const middleware = requireInternalSecret('segredo-certo');
    const req = buildRequest('segredo-certo');
    const res = buildResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('header ausente: 401 missing_internal_secret, next() nunca chamado', () => {
    const middleware = requireInternalSecret('segredo-certo');
    const req = buildRequest(undefined);
    const res = buildResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'missing_internal_secret' });
  });

  it('segredo incorreto: 401 invalid_internal_secret', () => {
    const middleware = requireInternalSecret('segredo-certo');
    const req = buildRequest('segredo-errado');
    const res = buildResponse();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toEqual({ error: 'invalid_internal_secret' });
  });

  it('segredo de tamanho diferente (evita lançar em timingSafeEqual por buffers de tamanhos distintos)', () => {
    const middleware = requireInternalSecret('segredo-longo-de-verdade');
    const req = buildRequest('curto');
    const res = buildResponse();
    const next = jest.fn();

    expect(() => middleware(req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
