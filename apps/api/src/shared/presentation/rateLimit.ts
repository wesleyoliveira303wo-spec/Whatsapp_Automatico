import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Opcoes do rate limiter (Milestone 5, Bloco M5H).
 *
 * `keyFn` e `now` sao injetaveis de proposito: `keyFn` permite limitar por
 * outra dimensao alem do IP (ex.: e-mail no login) e `now` permite avancar o
 * relogio nos testes sem `jest.useFakeTimers`.
 */
export interface RateLimitOptions {
  /** Tamanho da janela fixa, em milissegundos. */
  windowMs: number;
  /** Maximo de requisicoes permitidas por chave dentro de uma janela. */
  max: number;
  /** Extrai a chave de agrupamento da requisicao. Default: `req.ip ?? 'unknown'`. */
  keyFn?: (req: Request) => string;
  /** Fonte de tempo injetavel para testes. Default: `Date.now`. */
  now?: () => number;
}

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Limite de entradas no Map a partir do qual disparamos uma varredura de
 * limpeza. Sem isso, um atacante distribuido (muitos IPs distintos) faria o
 * Map crescer sem teto — cada IP novo cria uma entrada que so seria
 * "resetada" se o MESMO IP voltasse apos a janela vencer.
 */
const CLEANUP_THRESHOLD = 10_000;

/**
 * Rate limiter em memoria com janela fixa por chave (Milestone 5, Bloco M5H).
 *
 * Por que em memoria e nao Redis: o M5H pede protecao imediata de forca bruta
 * nas rotas de login/refresh SEM adicionar dependencias novas. O estado vive
 * POR PROCESSO — com N instancias da API atras de um load balancer, o limite
 * efetivo vira ate N * max por janela. Para o cenario atual (instancia unica)
 * isso e suficiente; um backend compartilhado (Redis, mesmo ja presente na
 * stack para BullMQ) fica registrado como evolucao futura quando a API
 * escalar horizontalmente.
 *
 * Estrategia de janela FIXA (nao deslizante): cada chave guarda apenas
 * `{ count, windowStart }` — O(1) de memoria por chave, sem arrays de
 * timestamps. O trade-off classico (ate 2x o limite na fronteira entre duas
 * janelas) e aceitavel para anti-forca-bruta.
 *
 * Limpeza de memoria em duas camadas:
 * 1. Preguicosa: ao consultar uma chave cuja janela venceu, a entrada e
 *    resetada no lugar (caminho quente, custo zero extra).
 * 2. Varredura: quando o Map ultrapassa 10_000 entradas, removemos todas as
 *    janelas vencidas de uma vez. Protege contra crescimento sem teto quando
 *    chaves nunca retornam (ex.: ataque distribuido com IPs descartaveis).
 *
 * Estourou o limite -> 429 com corpo padronizado e a cadeia PARA (next nao e
 * chamado): o AuthService nem chega a gastar scrypt com a tentativa.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { windowMs, max } = options;
  const keyFn = options.keyFn ?? ((req: Request): string => req.ip ?? 'unknown');
  const now = options.now ?? Date.now;

  const entries = new Map<string, RateLimitEntry>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const currentTime = now();

    if (entries.size > CLEANUP_THRESHOLD) {
      for (const [key, entry] of entries) {
        if (currentTime - entry.windowStart >= windowMs) {
          entries.delete(key);
        }
      }
    }

    const key = keyFn(req);
    const existing = entries.get(key);

    if (!existing || currentTime - existing.windowStart >= windowMs) {
      entries.set(key, { count: 1, windowStart: currentTime });
      next();
      return;
    }

    existing.count += 1;
    if (existing.count > max) {
      res.status(429).json({ error: 'too_many_requests', message: 'Muitas tentativas. Tente novamente em instantes.' });
      return;
    }
    next();
  };
}
