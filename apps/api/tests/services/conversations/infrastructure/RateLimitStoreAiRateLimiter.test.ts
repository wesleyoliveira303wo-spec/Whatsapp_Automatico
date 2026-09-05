import { RateLimitStoreAiRateLimiter } from '../../../../src/services/conversations/infrastructure/repositories/RateLimitStoreAiRateLimiter';
import { InMemoryRateLimitStore } from '../../../../src/shared/infrastructure/rateLimit/InMemoryRateLimitStore';

const TENANT = 'tenant-1';
const SESSION = 'sessao';

describe('RateLimitStoreAiRateLimiter', () => {
  it('permite até o limite por CONVERSA e bloqueia a seguinte', async () => {
    const limiter = new RateLimitStoreAiRateLimiter(
      new InMemoryRateLimitStore(),
      { limit: 2, windowMs: 60_000 },
      { limit: 100, windowMs: 60_000 },
    );

    expect(await limiter.consume(TENANT, SESSION, 'c-1')).toBe(true);
    expect(await limiter.consume(TENANT, SESSION, 'c-1')).toBe(true);
    expect(await limiter.consume(TENANT, SESSION, 'c-1')).toBe(false);
  });

  it('conversas diferentes têm baldes independentes', async () => {
    const limiter = new RateLimitStoreAiRateLimiter(
      new InMemoryRateLimitStore(),
      { limit: 1, windowMs: 60_000 },
      { limit: 100, windowMs: 60_000 },
    );

    expect(await limiter.consume(TENANT, SESSION, 'c-1')).toBe(true);
    expect(await limiter.consume(TENANT, SESSION, 'c-1')).toBe(false);
    expect(await limiter.consume(TENANT, SESSION, 'c-2')).toBe(true);
  });

  it('o limite de SESSÃO bloqueia mesmo com cada conversa dentro do próprio limite', async () => {
    const limiter = new RateLimitStoreAiRateLimiter(
      new InMemoryRateLimitStore(),
      { limit: 10, windowMs: 60_000 },
      { limit: 2, windowMs: 60_000 },
    );

    expect(await limiter.consume(TENANT, SESSION, 'c-1')).toBe(true);
    expect(await limiter.consume(TENANT, SESSION, 'c-2')).toBe(true);
    // Terceira conversa distinta: dentro do limite dela, fora do da sessão.
    expect(await limiter.consume(TENANT, SESSION, 'c-3')).toBe(false);
  });

  it('sessões diferentes do mesmo tenant não competem entre si', async () => {
    const limiter = new RateLimitStoreAiRateLimiter(
      new InMemoryRateLimitStore(),
      { limit: 10, windowMs: 60_000 },
      { limit: 1, windowMs: 60_000 },
    );

    expect(await limiter.consume(TENANT, 'sessao-a', 'c-1')).toBe(true);
    expect(await limiter.consume(TENANT, 'sessao-a', 'c-2')).toBe(false);
    expect(await limiter.consume(TENANT, 'sessao-b', 'c-3')).toBe(true);
  });

  it('tenants diferentes nunca compartilham contagem (isolamento multi-tenant)', async () => {
    const limiter = new RateLimitStoreAiRateLimiter(
      new InMemoryRateLimitStore(),
      { limit: 1, windowMs: 60_000 },
      { limit: 1, windowMs: 60_000 },
    );

    expect(await limiter.consume('tenant-a', SESSION, 'c-1')).toBe(true);
    expect(await limiter.consume('tenant-a', SESSION, 'c-1')).toBe(false);
    expect(await limiter.consume('tenant-b', SESSION, 'c-1')).toBe(true);
  });

  it('conta no balde da SESSÃO mesmo quando a conversa já estourou', async () => {
    // Sem isso, uma única conversa saturada esconderia do limite de sessão
    // todo o tráfego que ela mesma gera.
    const store = new InMemoryRateLimitStore();
    const limiter = new RateLimitStoreAiRateLimiter(
      store,
      { limit: 1, windowMs: 60_000 },
      { limit: 10, windowMs: 60_000 },
    );

    await limiter.consume(TENANT, SESSION, 'c-1');
    await limiter.consume(TENANT, SESSION, 'c-1'); // bloqueada pela conversa
    await limiter.consume(TENANT, SESSION, 'c-1'); // bloqueada pela conversa

    const sessao = await store.peek(`ai:session:${TENANT}:${SESSION}`, 60_000, 10);
    expect(sessao.count).toBe(3);
  });
});
