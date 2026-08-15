import path from 'path';
import dotenv from 'dotenv';
import IORedis from 'ioredis';
import { Queue, Worker, Job } from 'bullmq';
import { KeyedMutex } from '../../src/shared/infrastructure/concurrency/KeyedMutex';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface TestJobData {
  conversationId: string;
}

interface ExecutionRecord {
  conversationId: string;
  start: number;
  end: number;
}

/**
 * Fase 1, Bloco F1.10 (estabilidade para beta) — o `KeyedMutex.test.ts`
 * (unitário) já prova a lógica de serialização/paralelismo com Promises
 * FAKES, em memória. O que aquele teste NÃO prova é o comportamento real
 * quando plugado num `bullmq.Worker` de verdade com `concurrency: 5`
 * conectado a um Redis de verdade — que é exatamente como `worker.ts`
 * (produção) usa. Este arquivo reproduz o wiring real de `worker.ts`
 * (mesma classe `KeyedMutex`, mesma opção `concurrency: 5`) contra o
 * container Redis real do `docker-compose.yml`, para provar de ponta a
 * ponta:
 *   1. duas mensagens de conversas DIFERENTES são processadas em PARALELO
 *      (uma rajada em uma conversa não atrasa outra conversa);
 *   2. duas mensagens da MESMA conversa NUNCA rodam ao mesmo tempo (sem
 *      isso, duas respostas de IA conflitantes poderiam ser geradas para a
 *      mesma conversa).
 *
 * Pula (não falha) se Redis não estiver acessível — mesmo espírito de
 * "sem infra, sem crash" já usado no restante deste projeto.
 */
describe('Integração real — worker de ai-reply com concurrency real (Fase 1, Bloco F1.10)', () => {
  const queueName = `ai-reply-test-${Date.now()}`;
  let connection: IORedis;
  let queue: Queue<TestJobData>;
  let worker: Worker<TestJobData> | undefined;
  let redisAvailable = true;

  beforeAll(async () => {
    connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    try {
      await connection.connect();
    } catch {
      redisAvailable = false;
      return;
    }
    queue = new Queue<TestJobData>(queueName, { connection });
  });

  afterAll(async () => {
    if (!redisAvailable) return;
    await worker?.close();
    await queue.obliterate({ force: true }).catch(() => undefined);
    await queue.close();
    await connection.quit();
  });

  it('mesma conversa serializa, conversas diferentes rodam em paralelo — com Redis/BullMQ reais', async () => {
    if (!redisAvailable) {
      console.warn('Redis indisponível — pulando teste de integração real.');
      return;
    }

    const events: ExecutionRecord[] = [];
    const mutex = new KeyedMutex();
    const WORK_DURATION_MS = 200;

    worker = new Worker<TestJobData>(
      queueName,
      async (job: Job<TestJobData>) => {
        await mutex.run(job.data.conversationId, async () => {
          const start = Date.now();
          await sleep(WORK_DURATION_MS);
          const end = Date.now();
          events.push({ conversationId: job.data.conversationId, start, end });
        });
      },
      // MESMA configuração de `worker.ts` real — concurrency 5.
      { connection, concurrency: 5 },
    );
    await worker.waitUntilReady();

    const completed = new Promise<void>((resolve, reject) => {
      let count = 0;
      const TOTAL_JOBS = 4;
      worker?.on('completed', () => {
        count += 1;
        if (count === TOTAL_JOBS) resolve();
      });
      worker?.on('failed', (_job, error) => reject(error));
    });

    // 2 jobs da MESMA conversa (A) + 2 jobs de conversas DIFERENTES (B, C).
    await queue.add('job', { conversationId: 'conv-A' });
    await queue.add('job', { conversationId: 'conv-A' });
    await queue.add('job', { conversationId: 'conv-B' });
    await queue.add('job', { conversationId: 'conv-C' });

    await completed;

    const eventsForA = events.filter((e) => e.conversationId === 'conv-A');
    expect(eventsForA).toHaveLength(2);
    // Serialização real: a 2ª execução de A só começa depois que a 1ª terminou.
    const [firstA, secondA] = eventsForA.sort((a, b) => a.start - b.start);
    expect(secondA.start).toBeGreaterThanOrEqual(firstA.end);

    // Paralelismo real: A/B/C não são todos sequenciais — pelo menos um
    // par de execuções de CONVERSAS DIFERENTES se sobrepõe no tempo.
    // (Se o worker rodasse tudo em série, os 4 eventos ocupariam ~4x
    // WORK_DURATION_MS sem nenhuma sobreposição.)
    const overlapsAcrossConversations = events.some((a) =>
      events.some(
        (b) => a.conversationId !== b.conversationId && a.start < b.end && b.start < a.end,
      ),
    );
    expect(overlapsAcrossConversations).toBe(true);
  }, 15000);
});
