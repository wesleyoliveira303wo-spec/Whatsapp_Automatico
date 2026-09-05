import { NextFunction, Request, RequestHandler, Response } from 'express';

import { RateLimitStore } from '../domain/RateLimitStore';

/**
 * Opcoes do rate limiter (Milestone 5, Bloco M5H; store compartilhado no
 * bloco B1).
 *
 * `keyFn` e injetavel de proposito: permite limitar por outra dimensao alem
 * do IP (ex.: e-mail no login).
 */
export interface RateLimitOptions {
  /**
   * Onde a contagem vive. Em producao e o store apoiado em Redis, entao o
   * limite vale para TODAS as instancias da API e sobrevive a um restart —
   * antes do bloco B1 cada processo tinha o proprio `Map`, e o limite
   * efetivo virava `N * max` com N replicas.
   */
  store: RateLimitStore;
  /**
   * Prefixo que separa este limitador dos demais que compartilham o mesmo
   * store. Sem ele, o freio por IP e o freio por e-mail disputariam a mesma
   * chave quando ambos usassem o mesmo valor.
   */
  scope: string;
  /** Tamanho da janela deslizante, em milissegundos. */
  windowMs: number;
  /** Maximo de requisicoes permitidas por chave dentro de uma janela. */
  max: number;
  /** Extrai a chave de agrupamento da requisicao. Default: `req.ip ?? 'unknown'`. */
  keyFn?: (req: Request) => string;
}

/**
 * Rate limiter para as rotas de pre-autenticacao (login/refresh).
 *
 * Estrategia de janela DESLIZANTE (era fixa antes do bloco B1): conta as
 * tentativas dos ultimos `windowMs` a partir de agora. Elimina o defeito
 * classico da janela fixa — ate 2x o limite na fronteira entre duas janelas —
 * que a versao anterior documentava como trade-off aceito.
 *
 * Estourou o limite -> 429 com corpo padronizado e a cadeia PARA (`next` nao
 * e chamado): o AuthService nem chega a gastar scrypt com a tentativa.
 *
 * Se o store falhar, ele proprio ja degrada para contagem em memoria (ver
 * `FallbackRateLimitStore`) — este middleware nunca bloqueia o login por
 * indisponibilidade da infraestrutura de contagem.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const { store, scope, windowMs, max } = options;
  const keyFn = options.keyFn ?? ((req: Request): string => req.ip ?? 'unknown');

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    void store
      .hit(`${scope}:${keyFn(req)}`, windowMs, max)
      .then((result) => {
        if (result.allowed) {
          next();
          return;
        }
        res.setHeader('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
        res.status(429).json({
          error: 'too_many_requests',
          message: 'Muitas tentativas. Tente novamente em instantes.',
        });
      })
      .catch(() => {
        // O store ja tem fallback proprio; se ainda assim algo escapar,
        // deixamos passar em vez de derrubar o login inteiro.
        next();
      });
  };
}
