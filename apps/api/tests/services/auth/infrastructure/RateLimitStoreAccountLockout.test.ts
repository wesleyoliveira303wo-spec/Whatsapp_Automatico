import { RateLimitStoreAccountLockout } from '../../../../src/services/auth/infrastructure/RateLimitStoreAccountLockout';
import { InMemoryRateLimitStore } from '../../../../src/shared/infrastructure/rateLimit/InMemoryRateLimitStore';

function clock(start = 1_000_000): { now: () => number; advance: (ms: number) => void } {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const EMAIL = 'joao@empresa.com';

describe('RateLimitStoreAccountLockout', () => {
  it('não bloqueia antes de atingir o número de falhas', async () => {
    const lockout = new RateLimitStoreAccountLockout(new InMemoryRateLimitStore(), 3, 60_000);

    await lockout.recordFailure(EMAIL);
    await lockout.recordFailure(EMAIL);

    expect((await lockout.status(EMAIL)).locked).toBe(false);
  });

  it('bloqueia ao atingir o número de falhas', async () => {
    const lockout = new RateLimitStoreAccountLockout(new InMemoryRateLimitStore(), 3, 60_000);

    await lockout.recordFailure(EMAIL);
    await lockout.recordFailure(EMAIL);
    await lockout.recordFailure(EMAIL);

    const status = await lockout.status(EMAIL);
    expect(status.locked).toBe(true);
    expect(status.retryAfterMs).toBeGreaterThan(0);
  });

  it('status() não conta como tentativa (consultar não aproxima do bloqueio)', async () => {
    const lockout = new RateLimitStoreAccountLockout(new InMemoryRateLimitStore(), 2, 60_000);

    await lockout.recordFailure(EMAIL);
    await lockout.status(EMAIL);
    await lockout.status(EMAIL);
    await lockout.status(EMAIL);

    expect((await lockout.status(EMAIL)).locked).toBe(false);
  });

  it('clear() libera imediatamente (login bem-sucedido apaga o histórico)', async () => {
    const lockout = new RateLimitStoreAccountLockout(new InMemoryRateLimitStore(), 2, 60_000);

    await lockout.recordFailure(EMAIL);
    await lockout.recordFailure(EMAIL);
    expect((await lockout.status(EMAIL)).locked).toBe(true);

    await lockout.clear(EMAIL);
    expect((await lockout.status(EMAIL)).locked).toBe(false);
  });

  it('o bloqueio expira sozinho quando a janela passa', async () => {
    const time = clock();
    const lockout = new RateLimitStoreAccountLockout(
      new InMemoryRateLimitStore(time.now),
      2,
      60_000,
    );

    await lockout.recordFailure(EMAIL);
    await lockout.recordFailure(EMAIL);
    expect((await lockout.status(EMAIL)).locked).toBe(true);

    time.advance(61_000);
    expect((await lockout.status(EMAIL)).locked).toBe(false);
  });

  it('insistir durante o bloqueio NÃO estende o prazo', async () => {
    const time = clock();
    const lockout = new RateLimitStoreAccountLockout(
      new InMemoryRateLimitStore(time.now),
      2,
      60_000,
    );

    await lockout.recordFailure(EMAIL);
    await lockout.recordFailure(EMAIL);

    // Martela durante a janela — nenhuma dessas pode empurrar o prazo.
    for (let i = 0; i < 5; i += 1) {
      time.advance(10_000);
      await lockout.recordFailure(EMAIL);
    }

    time.advance(11_000); // total: 61s desde a primeira falha
    expect((await lockout.status(EMAIL)).locked).toBe(false);
  });

  it('e-mails diferentes são independentes', async () => {
    const lockout = new RateLimitStoreAccountLockout(new InMemoryRateLimitStore(), 1, 60_000);

    await lockout.recordFailure('a@x.com');
    expect((await lockout.status('a@x.com')).locked).toBe(true);
    expect((await lockout.status('b@x.com')).locked).toBe(false);
  });

  it('normaliza o e-mail: espaços e maiúsculas são a mesma conta', async () => {
    const lockout = new RateLimitStoreAccountLockout(new InMemoryRateLimitStore(), 2, 60_000);

    await lockout.recordFailure('  Joao@Empresa.COM ');
    await lockout.recordFailure('joao@empresa.com');

    expect((await lockout.status('JOAO@EMPRESA.com')).locked).toBe(true);
  });
});
