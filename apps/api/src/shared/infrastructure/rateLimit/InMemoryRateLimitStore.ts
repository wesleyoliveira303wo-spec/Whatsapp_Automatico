import { RateLimitHit, RateLimitStore } from '../../domain/RateLimitStore';

/**
 * A partir de quantas chaves disparamos uma varredura de limpeza. Sem isso,
 * um ataque distribuído (muitas chaves distintas que nunca voltam) faria o
 * `Map` crescer sem teto — mesma proteção que o limitador de login em
 * memória já tinha antes deste port.
 */
const CLEANUP_THRESHOLD = 10_000;

/**
 * Implementação em memória de `RateLimitStore` (janela deslizante por
 * timestamps), válida apenas DENTRO deste processo.
 *
 * Dois papéis:
 * 1. **Fallback** quando `REDIS_URL` não está configurada — a API roda em
 *    modo degradado por desenho (D8), e as rotas de auth continuam de pé
 *    nesse modo; um limitador que exigisse Redis derrubaria o login inteiro
 *    num ambiente que hoje funciona.
 * 2. **Teste**: com `now` injetável, dá para avançar o relógio sem
 *    `jest.useFakeTimers` (mesmo recurso que o limitador anterior já tinha).
 *
 * Limitação assumida e documentada: reiniciar o processo zera as contagens.
 * É por isso que o lockout de conta prefere Redis quando ele existe — um
 * bloqueio que evapora num restart é um bloqueio fraco.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    const now = this.now();
    this.cleanupIfNeeded(now);

    const fresh = this.freshHits(key, windowMs, now);

    if (fresh.length >= max) {
      // Grava a lista podada (sem os expirados) mas NÃO registra esta
      // tentativa: quem estourou espera a janela original vencer em vez de
      // renovar o bloqueio a cada nova tentativa.
      this.hits.set(key, fresh);
      return {
        allowed: false,
        count: fresh.length,
        retryAfterMs: this.retryAfterMs(fresh, windowMs, now),
      };
    }

    fresh.push(now);
    this.hits.set(key, fresh);
    return {
      allowed: true,
      count: fresh.length,
      retryAfterMs: this.retryAfterMs(fresh, windowMs, now),
    };
  }

  async peek(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    const now = this.now();
    const fresh = this.freshHits(key, windowMs, now);
    return {
      allowed: fresh.length < max,
      count: fresh.length,
      retryAfterMs: this.retryAfterMs(fresh, windowMs, now),
    };
  }

  async reset(key: string): Promise<void> {
    this.hits.delete(key);
  }

  private freshHits(key: string, windowMs: number, now: number): number[] {
    const cutoff = now - windowMs;
    return (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
  }

  /** Quanto falta para a tentativa MAIS ANTIGA sair da janela e liberar espaço. */
  private retryAfterMs(hits: number[], windowMs: number, now: number): number {
    if (hits.length === 0) return 0;
    const oldest = Math.min(...hits);
    return Math.max(0, oldest + windowMs - now);
  }

  private cleanupIfNeeded(now: number): void {
    if (this.hits.size <= CLEANUP_THRESHOLD) return;
    for (const [key, timestamps] of this.hits) {
      // Sem saber a janela de cada chave aqui, usa a maior janela plausível
      // do produto (1h) como corte conservador: só remove o que nenhum
      // limitador ainda consideraria válido.
      const stale = timestamps.every((timestamp) => timestamp <= now - 3_600_000);
      if (stale) this.hits.delete(key);
    }
  }
}
