import { Logger } from '../../domain/Logger';
import { RateLimitHit, RateLimitStore } from '../../domain/RateLimitStore';

/** Intervalo mínimo entre dois avisos de falha do store primário — evita inundar o log durante uma queda do Redis. */
const WARN_THROTTLE_MS = 60_000;

/**
 * Usa o store primário (Redis) e, se ele falhar, cai no secundário (memória)
 * — sem propagar o erro para quem chamou.
 *
 * O motivo é de produto, não de estilo: os limitadores protegem o LOGIN e a
 * INGESTÃO DE MENSAGEM. Se um Redis indisponível fizesse `hit()` lançar,
 * ninguém conseguiria entrar no sistema e nenhuma mensagem de cliente seria
 * processada — o controle de abuso teria virado a própria indisponibilidade
 * que ele deveria evitar. Degradar para a contagem por processo é
 * estritamente melhor: o limite fica mais frouxo (vale por instância) em vez
 * de inexistente, e volta ao normal sozinho quando o Redis responder.
 *
 * Mesma escolha já feita em outros pontos do produto para dependências
 * auxiliares (perfil de negócio da IA, resolução de contato, marcação de
 * resposta de campanha): a funcionalidade acessória nunca derruba o caminho
 * principal.
 */
export class FallbackRateLimitStore implements RateLimitStore {
  private lastWarnAt = 0;

  constructor(
    private readonly primary: RateLimitStore,
    private readonly fallback: RateLimitStore,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    try {
      return await this.primary.hit(key, windowMs, max);
    } catch (error) {
      this.warn('hit', error);
      return this.fallback.hit(key, windowMs, max);
    }
  }

  async peek(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    try {
      return await this.primary.peek(key, windowMs, max);
    } catch (error) {
      this.warn('peek', error);
      return this.fallback.peek(key, windowMs, max);
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.primary.reset(key);
    } catch (error) {
      this.warn('reset', error);
    }
    // Sempre limpa o fallback também: se a chave foi contada lá durante uma
    // queda do primário, um login bem-sucedido precisa zerar os dois.
    await this.fallback.reset(key);
  }

  private warn(operation: string, error: unknown): void {
    const now = this.now();
    if (now - this.lastWarnAt < WARN_THROTTLE_MS) return;
    this.lastWarnAt = now;
    this.logger.warn('Rate limit: store primário indisponível, usando contagem em memória', {
      operation,
      error,
    });
  }
}
