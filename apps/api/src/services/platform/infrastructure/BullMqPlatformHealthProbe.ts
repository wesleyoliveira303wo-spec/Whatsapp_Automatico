import {
  PlatformHealthProbe,
  PlatformHealthSnapshot,
  QueueDepth,
} from '../domain/providers/PlatformHealthProbe';

/** O mínimo de uma `Queue` BullMQ que este probe usa. */
export interface QueueCountsReader {
  name: string;
  /** Lê waiting/active/delayed/failed daquela fila — a implementação decide como. */
  getJobCounts(): Promise<{
    waiting?: number;
    active?: number;
    delayed?: number;
    failed?: number;
  }>;
}

export interface DatabasePinger {
  /** Deve resolver quando o Postgres respondeu, rejeitar/nunca-resolver quando não. */
  ping(): Promise<unknown>;
}

/**
 * `PlatformHealthProbe` sobre o Prisma + as três filas BullMQ — Fase 3
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §5.2, tela Saúde).
 *
 * É a mesma checagem do `/health/ready` (Postgres, Redis, filas), ampliada
 * para as TRÊS filas (`ai-reply`, `whatsapp-outbound`, `campaign-send`) e
 * servida atrás do porteiro de plataforma.
 *
 * Cada leitura tem teto de tempo curto (`Promise.race`): a conexão de fila
 * usa `maxRetriesPerRequest: null`, então um comando ioredis nunca rejeita
 * sozinho enquanto o Redis está fora — o probe ficaria pendurado, o oposto
 * do que serve. Mesma correção que o `/health/ready` já aplica.
 */
export class BullMqPlatformHealthProbe implements PlatformHealthProbe {
  constructor(
    private readonly database: DatabasePinger,
    private readonly queues: QueueCountsReader[],
    private readonly timeoutMs = 3000,
  ) {}

  async snapshot(): Promise<PlatformHealthSnapshot> {
    const dbResult = await this.raced(this.database.ping());
    const database = dbResult.ok ? 'ok' : 'down';

    const queues: QueueDepth[] = await Promise.all(
      this.queues.map(async (queue) => {
        const result = await this.raced(queue.getJobCounts());
        if (!result.ok) {
          return { name: queue.name, reachable: false, waiting: 0, active: 0, delayed: 0, failed: 0 };
        }
        const c = result.value;
        return {
          name: queue.name,
          reachable: true,
          waiting: c.waiting ?? 0,
          active: c.active ?? 0,
          delayed: c.delayed ?? 0,
          failed: c.failed ?? 0,
        };
      }),
    );

    // Redis está "ok" se ao menos uma fila respondeu (todas usam a mesma
    // infraestrutura); "down" se nenhuma respondeu.
    const redis = queues.some((q) => q.reachable) ? 'ok' : 'down';

    return { database, redis, queues: redis === 'ok' ? queues : [] };
  }

  /**
   * `{ ok: true, value }` se resolveu dentro do teto; `{ ok: false }` se
   * rejeitou ou estourou o tempo. Distingue "resolveu com valor falsy" de
   * "não respondeu" — importante para o probe não reportar Postgres como
   * "down" só porque `SELECT 1` devolveu algo falsy.
   */
  private async raced<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    promise.catch(() => {});
    const timeout = Symbol('timeout');
    try {
      const result = await Promise.race([
        promise,
        new Promise<typeof timeout>((resolve) => setTimeout(() => resolve(timeout), this.timeoutMs)),
      ]);
      return result === timeout ? { ok: false } : { ok: true, value: result as T };
    } catch {
      return { ok: false };
    }
  }
}
