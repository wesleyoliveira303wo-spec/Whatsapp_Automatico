import { RateLimitStore } from '../../../shared/domain/RateLimitStore';
import { AccountLockout, AccountLockoutStatus } from '../domain/AccountLockout';

/**
 * Quantas falhas seguidas bloqueiam a conta, e por quanto tempo.
 *
 * 5 tentativas / 15 minutos: uma pessoa que errou a senha algumas vezes
 * ainda consegue tentar de novo em pouco tempo, mas força bruta fica
 * inviável — mesmo com uma lista grande de senhas, o atacante consegue 5
 * tentativas a cada 15 minutos por conta.
 *
 * Como a janela é DESLIZANTE, "bloqueada por 15 minutos" significa, mais
 * precisamente: bloqueada até a mais antiga das 5 falhas completar 15
 * minutos. Tentar durante o bloqueio NÃO estende o prazo (`hit` não registra
 * quando já estourou) — quem errou não fica preso para sempre por insistir.
 */
export const DEFAULT_MAX_FAILURES = 5;
export const DEFAULT_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

/** Mesma normalização usada pelo rate limiter por identidade — `João@X.com ` e `joao@x.com` são a mesma conta. */
function keyFor(email: string): string {
  return `lockout:${email.trim().toLowerCase()}`;
}

/**
 * `AccountLockout` apoiado no `RateLimitStore` compartilhado — logo, no
 * Redis quando ele existe.
 *
 * Que a contagem viva no Redis não é detalhe: um lockout guardado em memória
 * evaporaria a cada restart do processo, e reiniciar a API (deploy, crash,
 * OOM) daria fôlego novo a um ataque em andamento. Com o store compartilhado
 * o bloqueio sobrevive ao restart e vale para todas as instâncias.
 */
export class RateLimitStoreAccountLockout implements AccountLockout {
  constructor(
    private readonly store: RateLimitStore,
    private readonly maxFailures: number = DEFAULT_MAX_FAILURES,
    private readonly windowMs: number = DEFAULT_LOCKOUT_WINDOW_MS,
  ) {}

  async status(email: string): Promise<AccountLockoutStatus> {
    const hit = await this.store.peek(keyFor(email), this.windowMs, this.maxFailures);
    return { locked: !hit.allowed, retryAfterMs: hit.allowed ? 0 : hit.retryAfterMs };
  }

  async recordFailure(email: string): Promise<void> {
    await this.store.hit(keyFor(email), this.windowMs, this.maxFailures);
  }

  async clear(email: string): Promise<void> {
    await this.store.reset(keyFor(email));
  }
}
