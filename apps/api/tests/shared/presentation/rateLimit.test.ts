import { createRateLimiter } from '../../../src/shared/presentation/rateLimit';
import { InMemoryRateLimitStore } from '../../../src/shared/infrastructure/rateLimit/InMemoryRateLimitStore';
import { RateLimitStore } from '../../../src/shared/domain/RateLimitStore';
import type { Request, Response } from 'express';

function fakeReq(ip: string, body?: Record<string, unknown>): Request {
  return { ip, body: body ?? {} } as unknown as Request;
}

function fakeRes(): {
  res: Response;
  statusMock: jest.Mock;
  jsonMock: jest.Mock;
  setHeaderMock: jest.Mock;
} {
  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const setHeaderMock = jest.fn();
  return {
    res: { status: statusMock, json: jsonMock, setHeader: setHeaderMock } as unknown as Response,
    statusMock,
    jsonMock,
    setHeaderMock,
  };
}

/**
 * O middleware ficou ASSÍNCRONO no bloco B1 (a contagem vive num store, hoje
 * Redis). Ele não devolve promise — chama `next()`/responde dentro de um
 * `.then`, como todo middleware do Express —, então o teste precisa drenar a
 * fila de microtasks antes de afirmar qualquer coisa.
 */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('createRateLimiter (Milestone 5, Bloco M5H; store compartilhado no B1)', () => {
  it('abaixo do limite: deixa passar (next chamado, sem resposta)', async () => {
    const limiter = createRateLimiter({
      store: new InMemoryRateLimitStore(),
      scope: 's',
      windowMs: 1000,
      max: 3,
    });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), res, next);
    await flush();
    limiter(fakeReq('1.1.1.1'), res, next);
    await flush();
    limiter(fakeReq('1.1.1.1'), res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(3);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('estourou o limite: 429 too_many_requests, Retry-After e next NAO e chamado', async () => {
    const limiter = createRateLimiter({
      store: new InMemoryRateLimitStore(),
      scope: 's',
      windowMs: 1000,
      max: 2,
    });
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    await flush();
    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    await flush();
    expect(next).toHaveBeenCalledTimes(2);

    const { res, statusMock, jsonMock, setHeaderMock } = fakeRes();
    limiter(fakeReq('1.1.1.1'), res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(2); // nao avancou
    expect(statusMock).toHaveBeenCalledWith(429);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'too_many_requests' }),
    );
    expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('chaves diferentes (IPs distintos) nao competem entre si', async () => {
    const limiter = createRateLimiter({
      store: new InMemoryRateLimitStore(),
      scope: 's',
      windowMs: 1000,
      max: 1,
    });
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    await flush();
    limiter(fakeReq('2.2.2.2'), fakeRes().res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('janela deslizante: libera quando a tentativa mais antiga expira', async () => {
    const time = clock();
    const limiter = createRateLimiter({
      store: new InMemoryRateLimitStore(time.now),
      scope: 's',
      windowMs: 1000,
      max: 1,
    });
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    await flush();
    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    await flush();
    expect(next).toHaveBeenCalledTimes(1);

    time.advance(1100);
    limiter(fakeReq('1.1.1.1'), fakeRes().res, next);
    await flush();
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('keyFn permite limitar por outra dimensao (ex.: e-mail no corpo)', async () => {
    const limiter = createRateLimiter({
      store: new InMemoryRateLimitStore(),
      scope: 's',
      windowMs: 1000,
      max: 1,
      keyFn: (req) => String((req.body as { email?: string }).email ?? 'unknown'),
    });
    const next = jest.fn();

    // Mesmo e-mail, IPs diferentes: o segundo e barrado.
    limiter(fakeReq('1.1.1.1', { email: 'a@x.com' }), fakeRes().res, next);
    await flush();
    const { res, statusMock } = fakeRes();
    limiter(fakeReq('2.2.2.2', { email: 'a@x.com' }), res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).toHaveBeenCalledWith(429);
  });

  it('`scope` isola limitadores que compartilham o mesmo store', async () => {
    // Sem o prefixo de escopo, o freio por IP e o freio por identidade
    // disputariam a mesma chave quando o valor coincidisse.
    const store = new InMemoryRateLimitStore();
    const porIp = createRateLimiter({ store, scope: 'login:ip', windowMs: 1000, max: 1 });
    const porIdentidade = createRateLimiter({
      store,
      scope: 'login:identity',
      windowMs: 1000,
      max: 1,
      keyFn: () => '1.1.1.1', // mesmo valor de chave que o IP acima
    });
    const next = jest.fn();

    porIp(fakeReq('1.1.1.1'), fakeRes().res, next);
    await flush();
    porIdentidade(fakeReq('9.9.9.9'), fakeRes().res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('store indisponivel: deixa passar em vez de derrubar o login', async () => {
    const brokenStore: RateLimitStore = {
      hit: () => Promise.reject(new Error('store fora do ar')),
      peek: () => Promise.reject(new Error('store fora do ar')),
      reset: () => Promise.reject(new Error('store fora do ar')),
    };
    const limiter = createRateLimiter({
      store: brokenStore,
      scope: 's',
      windowMs: 1000,
      max: 1,
    });
    const { res, statusMock } = fakeRes();
    const next = jest.fn();

    limiter(fakeReq('1.1.1.1'), res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });
});
