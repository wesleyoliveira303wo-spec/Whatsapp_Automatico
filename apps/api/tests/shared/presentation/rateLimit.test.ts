import { createRateLimiter } from '../../../src/shared/presentation/rateLimit';
import type { Request, Response } from 'express';

function fakeReq(ip: string, body?: Record<string, unknown>): Request {
  return { ip, body: body ?? {} } as unknown as Request;
}

function fakeRes(): { res: Response; statusMock: jest.Mock; jsonMock: jest.Mock } {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  return {
    res: { status: statusMock, json: jsonMock } as unknown as Response,
    statusMock,
    jsonMock,
  };
}

describe('createRateLimiter (Milestone 5, Bloco M5H)', () => {
  it('abaixo do limite: deixa passar (next chamado, sem resposta)', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 3, now: () => 0 });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), res, next);
    limiter(fakeReq('1.1.1.1'), res, next);
    limiter(fakeReq('1.1.1.1'), res, next);

    expect(next).toHaveBeenCalledTimes(3);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('estourou o limite: 429 too_many_requests e next NAO e chamado', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2, now: () => 0 });
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    expect(next).toHaveBeenCalledTimes(2);

    const { res, statusMock, jsonMock } = fakeRes();
    limiter(fakeReq('1.1.1.1'), res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(statusMock).toHaveBeenCalledWith(429);
    expect(jsonMock).toHaveBeenCalledWith({
      error: 'too_many_requests',
      message: 'Muitas tentativas. Tente novamente em instantes.',
    });
  });

  it('janela expira (relogio injetado avanca): volta a deixar passar', () => {
    // Relogio controlado pelo teste — o porque do `now` injetavel.
    let currentTime = 0;
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => currentTime });
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    const blocked = fakeRes();
    limiter(fakeReq('1.1.1.1'), blocked.res, next);
    expect(blocked.statusMock).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(1);

    currentTime = 1000;
    const { res, statusMock } = fakeRes();
    limiter(fakeReq('1.1.1.1'), res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('chaves diferentes (IPs distintos) nao interferem entre si', () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    const blocked = fakeRes();
    limiter(fakeReq('1.1.1.1'), blocked.res, next);
    expect(blocked.statusMock).toHaveBeenCalledWith(429);

    const other = fakeRes();
    limiter(fakeReq('2.2.2.2'), other.res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(other.statusMock).not.toHaveBeenCalled();
  });

  it('keyFn customizado e respeitado (limita por e-mail, ignorando o IP)', () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 1,
      now: () => 0,
      keyFn: (req) => String((req.body as Record<string, unknown>).email ?? 'unknown'),
    });
    const next = jest.fn();

    // Mesmo e-mail vindo de IPs diferentes: conta na MESMA chave.
    limiter(fakeReq('1.1.1.1', { email: 'a@b.com' }), fakeRes().res, next);
    const blocked = fakeRes();
    limiter(fakeReq('9.9.9.9', { email: 'a@b.com' }), blocked.res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(blocked.statusMock).toHaveBeenCalledWith(429);

    // E-mail diferente no mesmo IP bloqueado: passa (chave distinta).
    const other = fakeRes();
    limiter(fakeReq('9.9.9.9', { email: 'c@d.com' }), other.res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(other.statusMock).not.toHaveBeenCalled();
  });
});
