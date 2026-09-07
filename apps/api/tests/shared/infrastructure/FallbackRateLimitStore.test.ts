import { FallbackRateLimitStore } from '../../../src/shared/infrastructure/rateLimit/FallbackRateLimitStore';
import { InMemoryRateLimitStore } from '../../../src/shared/infrastructure/rateLimit/InMemoryRateLimitStore';
import { RateLimitStore } from '../../../src/shared/domain/RateLimitStore';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';

/** Store que sempre falha — simula o Redis fora do ar. */
class BrokenStore implements RateLimitStore {
  public calls = 0;
  async hit(): Promise<never> {
    this.calls += 1;
    throw new Error('redis fora do ar');
  }
  async peek(): Promise<never> {
    this.calls += 1;
    throw new Error('redis fora do ar');
  }
  async reset(): Promise<never> {
    this.calls += 1;
    throw new Error('redis fora do ar');
  }
}

describe('FallbackRateLimitStore', () => {
  it('usa o primário quando ele responde', async () => {
    const primary = new InMemoryRateLimitStore();
    const fallback = new InMemoryRateLimitStore();
    const store = new FallbackRateLimitStore(primary, fallback, new NoopLogger());

    await store.hit('k', 60_000, 1);

    // Contou no primário, não no fallback.
    expect((await primary.peek('k', 60_000, 1)).count).toBe(1);
    expect((await fallback.peek('k', 60_000, 1)).count).toBe(0);
  });

  it('primário fora do ar: NÃO propaga o erro e conta no fallback', async () => {
    const primary = new BrokenStore();
    const fallback = new InMemoryRateLimitStore();
    const store = new FallbackRateLimitStore(primary, fallback, new NoopLogger());

    const result = await store.hit('k', 60_000, 2);

    expect(result.allowed).toBe(true);
    expect((await fallback.peek('k', 60_000, 2)).count).toBe(1);
  });

  it('primário fora do ar: o limite continua valendo (degradado, nunca inexistente)', async () => {
    const store = new FallbackRateLimitStore(
      new BrokenStore(),
      new InMemoryRateLimitStore(),
      new NoopLogger(),
    );

    expect((await store.hit('k', 60_000, 1)).allowed).toBe(true);
    expect((await store.hit('k', 60_000, 1)).allowed).toBe(false);
  });

  it('peek degrada da mesma forma', async () => {
    const fallback = new InMemoryRateLimitStore();
    const store = new FallbackRateLimitStore(new BrokenStore(), fallback, new NoopLogger());

    await store.hit('k', 60_000, 2);
    expect((await store.peek('k', 60_000, 2)).count).toBe(1);
  });

  it('reset limpa o fallback mesmo quando o primário falha', async () => {
    const fallback = new InMemoryRateLimitStore();
    const store = new FallbackRateLimitStore(new BrokenStore(), fallback, new NoopLogger());

    await store.hit('k', 60_000, 1);
    expect((await store.hit('k', 60_000, 1)).allowed).toBe(false);

    await store.reset('k');
    expect((await store.hit('k', 60_000, 1)).allowed).toBe(true);
  });

  it('reset limpa os DOIS stores (chave pode ter sido contada em ambos durante uma oscilação)', async () => {
    const primary = new InMemoryRateLimitStore();
    const fallback = new InMemoryRateLimitStore();
    const store = new FallbackRateLimitStore(primary, fallback, new NoopLogger());

    await primary.hit('k', 60_000, 5);
    await fallback.hit('k', 60_000, 5);

    await store.reset('k');

    expect((await primary.peek('k', 60_000, 5)).count).toBe(0);
    expect((await fallback.peek('k', 60_000, 5)).count).toBe(0);
  });

  it('não inunda o log: avisos consecutivos são limitados por janela', async () => {
    const logger = new NoopLogger();
    const warn = jest.spyOn(logger, 'warn');
    const store = new FallbackRateLimitStore(
      new BrokenStore(),
      new InMemoryRateLimitStore(),
      logger,
    );

    await store.hit('a', 60_000, 10);
    await store.hit('b', 60_000, 10);
    await store.hit('c', 60_000, 10);

    expect(warn).toHaveBeenCalledTimes(1);
  });
});
