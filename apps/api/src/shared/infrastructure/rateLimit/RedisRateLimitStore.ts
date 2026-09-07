import { randomUUID } from 'crypto';

import { RateLimitHit, RateLimitStore } from '../../domain/RateLimitStore';

/**
 * Só o que este store precisa de um cliente Redis. Interface mínima em vez
 * de importar os tipos do `ioredis` aqui: a API carrega o `ioredis` por
 * import DINÂMICO (`await import('ioredis')`, ver `index.ts`) para o modo
 * degradado poder subir sem ele, e um import de tipo no topo deste arquivo
 * amarraria o módulo a essa dependência.
 */
export interface RedisLikeClient {
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
  del(key: string): Promise<number>;
}

/**
 * Janela deslizante num sorted set: cada tentativa vira um membro com score
 * = instante em que aconteceu. Contar = `ZCARD` depois de remover o que caiu
 * fora da janela.
 *
 * Tudo num único script Lua porque o Redis executa scripts de forma ATÔMICA:
 * remover-expirados → contar → decidir → registrar acontece sem que outro
 * processo se intrometa no meio. Fazer isso em comandos separados abriria
 * exatamente a corrida que este bloco existe para fechar (N processos leem o
 * mesmo contador e todos passam).
 *
 * Devolve `[allowed, count, retryAfterMs]` — o Lua só sabe devolver
 * inteiros/strings, então o booleano viaja como 0/1.
 */
const HIT_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retryAfter = 0
if oldest[2] then
  retryAfter = math.max(0, tonumber(oldest[2]) + windowMs - now)
end

if count >= max then
  return {0, count, retryAfter}
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, windowMs)
if retryAfter == 0 then
  retryAfter = windowMs
end
return {1, count + 1, retryAfter}
`;

/** Igual ao de cima, sem o `ZADD`: consulta sem contar como tentativa. */
const PEEK_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
local count = redis.call('ZCARD', key)
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local retryAfter = 0
if oldest[2] then
  retryAfter = math.max(0, tonumber(oldest[2]) + windowMs - now)
end

local allowed = 0
if count < max then
  allowed = 1
end
return {allowed, count, retryAfter}
`;

/** Prefixo de chave — mantém os contadores longe das chaves do BullMQ no mesmo Redis. */
const KEY_PREFIX = 'ratelimit:';

/**
 * `RateLimitStore` sobre Redis — o limite passa a valer para o sistema
 * inteiro, não só para o processo que atendeu a requisição, e as contagens
 * sobrevivem a um restart (essencial para o lockout de conta: um bloqueio
 * que evapora quando o processo reinicia não bloqueia nada).
 *
 * Todas as chaves expiram sozinhas (`PEXPIRE` a cada tentativa registrada) —
 * nenhuma rotina de limpeza necessária.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly redis: RedisLikeClient,
    private readonly now: () => number = Date.now,
  ) {}

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    const raw = await this.redis.eval(
      HIT_SCRIPT,
      1,
      KEY_PREFIX + key,
      this.now(),
      windowMs,
      max,
      randomUUID(),
    );
    return toHit(raw);
  }

  async peek(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    const raw = await this.redis.eval(
      PEEK_SCRIPT,
      1,
      KEY_PREFIX + key,
      this.now(),
      windowMs,
      max,
    );
    return toHit(raw);
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(KEY_PREFIX + key);
  }
}

function toHit(raw: unknown): RateLimitHit {
  const [allowed, count, retryAfterMs] = raw as [number, number, number];
  return { allowed: allowed === 1, count, retryAfterMs };
}
