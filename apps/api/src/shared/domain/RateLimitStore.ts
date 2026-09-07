/**
 * Contador de tentativas por chave, com janela deslizante — a peça
 * compartilhada entre os três controles de abuso do produto (B1):
 *
 * 1. rate limit de login/refresh (`shared/presentation/rateLimit.ts`);
 * 2. lockout de conta (contagem de falhas de login por e-mail);
 * 3. rate limit de IA (`AiRateLimiter`, custo real em US$ por chamada).
 *
 * Antes deste port cada um tinha o próprio `Map` em memória, válido apenas
 * dentro de um processo. Com um store compartilhado (Redis), o limite passa
 * a valer para o sistema inteiro, e — mais importante para o lockout — a
 * contagem SOBREVIVE a um restart do processo: sem isso, reiniciar a API
 * zeraria o contador e daria fôlego novo a um ataque de força bruta.
 *
 * JANELA DESLIZANTE, não fixa: `hit()` conta quantas tentativas ocorreram
 * nos últimos `windowMs` a partir de AGORA. Elimina o defeito clássico da
 * janela fixa (até 2x o limite na fronteira entre duas janelas), que o
 * limitador de login anterior documentava como trade-off aceito.
 *
 * A implementação precisa ser ATÔMICA: contar e decidir em dois passos
 * separados deixa uma janela de corrida em que N processos leem o mesmo
 * valor e todos passam.
 */
export interface RateLimitHit {
  /** `true` = dentro do limite, siga; `false` = estourou, bloqueie. */
  allowed: boolean;
  /** Tentativas contadas na janela (inclui a atual quando `allowed`). */
  count: number;
  /**
   * Quando a tentativa mais antiga da janela expira (epoch ms) — é a partir
   * de quando sobra espaço de novo. Usado para `Retry-After` e para dizer ao
   * usuário quanto tempo falta no lockout.
   */
  retryAfterMs: number;
}

export interface RateLimitStore {
  /**
   * Registra uma tentativa para `key` e devolve se ela cabe no limite.
   * Quando estoura, a tentativa NÃO é registrada (não estende o bloqueio a
   * cada nova tentativa — quem estourou espera a janela original vencer, em
   * vez de ficar preso para sempre por seguir tentando).
   */
  hit(key: string, windowMs: number, max: number): Promise<RateLimitHit>;

  /**
   * Quantas tentativas há na janela, SEM registrar uma nova. Usado pelo
   * lockout para responder "esta conta está bloqueada?" sem que a própria
   * consulta conte como tentativa.
   */
  peek(key: string, windowMs: number, max: number): Promise<RateLimitHit>;

  /** Zera a chave. Usado quando um login dá certo: o histórico de falhas some. */
  reset(key: string): Promise<void>;
}
