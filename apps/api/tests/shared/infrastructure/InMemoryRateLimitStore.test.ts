import { InMemoryRateLimitStore } from '../../../src/shared/infrastructure/rateLimit/InMemoryRateLimitStore';

/** Relógio controlável — evita `jest.useFakeTimers` e deixa o avanço explícito no teste. */
function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('InMemoryRateLimitStore', () => {
  it('permite até o limite e bloqueia a tentativa seguinte', async () => {
    const store = new InMemoryRateLimitStore();

    expect((await store.hit('k', 60_000, 3)).allowed).toBe(true);
    expect((await store.hit('k', 60_000, 3)).allowed).toBe(true);
    expect((await store.hit('k', 60_000, 3)).allowed).toBe(true);

    const blocked = await store.hit('k', 60_000, 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(3);
  });

  it('janela DESLIZANTE: libera assim que a tentativa mais antiga sai da janela', async () => {
    const time = clock();
    const store = new InMemoryRateLimitStore(time.now);

    await store.hit('k', 60_000, 2);
    time.advance(30_000);
    await store.hit('k', 60_000, 2);

    expect((await store.hit('k', 60_000, 2)).allowed).toBe(false);

    // 31s depois, a PRIMEIRA tentativa (aos 0s) saiu da janela de 60s.
    time.advance(31_000);
    expect((await store.hit('k', 60_000, 2)).allowed).toBe(true);
  });

  it('tentativa bloqueada NÃO é registrada (não renova o bloqueio a cada nova tentativa)', async () => {
    const time = clock();
    const store = new InMemoryRateLimitStore(time.now);

    await store.hit('k', 60_000, 1);
    // Martela durante quase a janela inteira — nenhuma dessas conta.
    for (let i = 0; i < 10; i += 1) {
      time.advance(5_000);
      expect((await store.hit('k', 60_000, 1)).allowed).toBe(false);
    }

    // Passados 60s da ÚNICA tentativa registrada, libera — se as bloqueadas
    // tivessem sido gravadas, a janela teria sido empurrada para frente.
    time.advance(11_000);
    expect((await store.hit('k', 60_000, 1)).allowed).toBe(true);
  });

  it('chaves são independentes', async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit('a', 60_000, 1);
    expect((await store.hit('a', 60_000, 1)).allowed).toBe(false);
    expect((await store.hit('b', 60_000, 1)).allowed).toBe(true);
  });

  it('peek() consulta sem contar como tentativa', async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit('k', 60_000, 2);

    expect((await store.peek('k', 60_000, 2)).count).toBe(1);
    expect((await store.peek('k', 60_000, 2)).count).toBe(1);
    expect((await store.peek('k', 60_000, 2)).allowed).toBe(true);

    await store.hit('k', 60_000, 2);
    expect((await store.peek('k', 60_000, 2)).allowed).toBe(false);
  });

  it('reset() zera a contagem', async () => {
    const store = new InMemoryRateLimitStore();
    await store.hit('k', 60_000, 1);
    expect((await store.hit('k', 60_000, 1)).allowed).toBe(false);

    await store.reset('k');
    expect((await store.hit('k', 60_000, 1)).allowed).toBe(true);
  });

  it('retryAfterMs informa quanto falta para a tentativa mais antiga expirar', async () => {
    const time = clock();
    const store = new InMemoryRateLimitStore(time.now);

    await store.hit('k', 60_000, 1);
    time.advance(20_000);

    const blocked = await store.hit('k', 60_000, 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(40_000);
  });
});
