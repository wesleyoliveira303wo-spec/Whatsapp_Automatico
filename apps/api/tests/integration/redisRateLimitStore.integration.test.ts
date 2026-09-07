import path from 'path';
import dotenv from 'dotenv';
import IORedis from 'ioredis';

import { RedisRateLimitStore } from '../../src/shared/infrastructure/rateLimit/RedisRateLimitStore';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Teto de tempo próprio para testes que falam com infraestrutura REAL.
 *
 * Medido (2026-09-05), não chutado: o `beforeAll` destes arquivos leva ~5s
 * só para subir o motor de consulta do Prisma dentro do Jest no Windows —
 * ou seja, oscila EXATAMENTE em cima do teto padrão de 5s do Jest. O
 * resultado era uma suíte que passava numa execução e falhava na seguinte
 * sem nenhuma mudança de código, com uma mensagem ("Exceeded timeout ... for
 * a hook") que aponta para o teste em vez de para a causa. O padrão de 5s
 * nunca foi uma afirmação sobre estes testes; é só o default de um teste de
 * unidade.
 */
jest.setTimeout(30_000);


/**
 * B1 — `RedisRateLimitStore` contra um Redis REAL.
 *
 * A razão de existir deste arquivo: a garantia que este bloco entrega é
 * "o limite vale para o SISTEMA, não para o processo". Um fake em memória
 * não prova isso — ele provaria apenas que a nossa classe soma direito. O
 * que precisa ser provado é que DUAS instâncias distintas do store, como
 * seriam duas réplicas da API, enxergam a mesma contagem; e que o script
 * Lua é atômico sob concorrência real.
 *
 * Pula (não falha) sem Redis, mesmo contrato dos demais testes de
 * integração. A ausência do aviso "Redis indisponível" na saída é o que
 * confirma que ele de fato rodou (lição registrada no Bloco L1).
 */
describe('Integração real — RedisRateLimitStore (B1)', () => {
  let redis: IORedis;
  let redisAvailable = true;
  const prefix = `test-ratelimit-${Date.now()}`;

  beforeAll(async () => {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    redis = new IORedis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
    try {
      await redis.connect();
      await redis.ping();
    } catch {
      redisAvailable = false;
    }
  });

  afterAll(async () => {
    if (redisAvailable) {
      const keys = await redis.keys(`ratelimit:${prefix}*`);
      if (keys.length > 0) await redis.del(...keys);
    }
    await redis.quit().catch(() => undefined);
  });

  it('permite até o limite e bloqueia a tentativa seguinte', async () => {
    if (!redisAvailable) {
      console.warn('Redis indisponível — pulando teste de integração real.');
      return;
    }
    const store = new RedisRateLimitStore(redis);
    const key = `${prefix}:basico`;

    expect((await store.hit(key, 60_000, 3)).allowed).toBe(true);
    expect((await store.hit(key, 60_000, 3)).allowed).toBe(true);
    expect((await store.hit(key, 60_000, 3)).allowed).toBe(true);

    const blocked = await store.hit(key, 60_000, 3);
    expect(blocked.allowed).toBe(false);
    expect(blocked.count).toBe(3);
  });

  it('DUAS instâncias (dois "processos") compartilham a mesma contagem', async () => {
    if (!redisAvailable) {
      console.warn('Redis indisponível — pulando teste de integração real.');
      return;
    }
    // É esta a garantia que o bloco B1 entrega e que a versão em memória
    // nunca deu: cada instância seria uma réplica da API.
    const processoA = new RedisRateLimitStore(redis);
    const processoB = new RedisRateLimitStore(redis);
    const key = `${prefix}:compartilhado`;

    expect((await processoA.hit(key, 60_000, 2)).allowed).toBe(true);
    expect((await processoB.hit(key, 60_000, 2)).allowed).toBe(true);

    // O terceiro estoura, não importa em qual instância — antes disso, cada
    // processo teria o próprio contador e ambos deixariam passar.
    expect((await processoA.hit(key, 60_000, 2)).allowed).toBe(false);
    expect((await processoB.hit(key, 60_000, 2)).allowed).toBe(false);
  });

  it('é atômico sob concorrência: 20 tentativas simultâneas com limite 5 liberam exatamente 5', async () => {
    if (!redisAvailable) {
      console.warn('Redis indisponível — pulando teste de integração real.');
      return;
    }
    const store = new RedisRateLimitStore(redis);
    const key = `${prefix}:concorrencia`;

    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.hit(key, 60_000, 5)),
    );

    // Sem o script Lava atômico, várias chamadas leriam o mesmo `ZCARD`
    // antes de qualquer `ZADD` e passariam juntas.
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it('janela deslizante: expira sozinha e volta a permitir', async () => {
    if (!redisAvailable) {
      console.warn('Redis indisponível — pulando teste de integração real.');
      return;
    }
    const store = new RedisRateLimitStore(redis);
    const key = `${prefix}:janela`;

    // Janela curta de verdade (300ms) para o teste não ficar lento.
    expect((await store.hit(key, 300, 1)).allowed).toBe(true);
    expect((await store.hit(key, 300, 1)).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 350));
    expect((await store.hit(key, 300, 1)).allowed).toBe(true);
  });

  it('peek() consulta sem contar; reset() zera', async () => {
    if (!redisAvailable) {
      console.warn('Redis indisponível — pulando teste de integração real.');
      return;
    }
    const store = new RedisRateLimitStore(redis);
    const key = `${prefix}:peek`;

    await store.hit(key, 60_000, 2);
    expect((await store.peek(key, 60_000, 2)).count).toBe(1);
    expect((await store.peek(key, 60_000, 2)).count).toBe(1);

    await store.hit(key, 60_000, 2);
    expect((await store.peek(key, 60_000, 2)).allowed).toBe(false);

    await store.reset(key);
    expect((await store.peek(key, 60_000, 2)).count).toBe(0);
    expect((await store.hit(key, 60_000, 2)).allowed).toBe(true);
  });

  it('a chave expira sozinha no Redis (sem rotina de limpeza)', async () => {
    if (!redisAvailable) {
      console.warn('Redis indisponível — pulando teste de integração real.');
      return;
    }
    const store = new RedisRateLimitStore(redis);
    const key = `${prefix}:ttl`;

    await store.hit(key, 5_000, 3);
    const ttl = await redis.pttl(`ratelimit:${key}`);

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(5_000);
  });
});
