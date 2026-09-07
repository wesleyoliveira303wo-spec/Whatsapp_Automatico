/** Profundidade de UMA fila BullMQ num instante. */
export interface QueueDepth {
  /** `ai-reply`, `whatsapp-outbound` ou `campaign-send`. */
  name: string;
  /** `false` quando o Redis não respondeu a tempo — os números abaixo ficam 0. */
  reachable: boolean;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface PlatformHealthSnapshot {
  database: 'ok' | 'down';
  redis: 'ok' | 'down';
  /** As três filas, na ordem fixa. Vazio quando o Redis está fora. */
  queues: QueueDepth[];
}

/**
 * Porta da checagem de infraestrutura do `/admin` — Fase 3
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §5.2, tela Saúde).
 *
 * É a MESMA informação de `/health/ready` (Postgres, Redis, filas), mas
 * ampliada para as TRÊS filas (o `/health/ready` do produto olhava só
 * `ai-reply` — a ampliação faz parte desta fase) e servida atrás do porteiro
 * de plataforma, com o resto do painel.
 *
 * Implementada em `index.ts` (onde vivem a conexão Prisma e os objetos
 * `Queue`), injetada de forma OPCIONAL no `services/platform`: sem ela (modo
 * degradado, sem `REDIS_URL`) a tela Saúde diz "não foi possível verificar"
 * em vez de fingir um número.
 *
 * Nunca lança e nunca fica pendurada: cada checagem tem teto de tempo curto
 * (`Promise.race`), pela mesma razão do `/health/ready` — um probe de
 * prontidão que trava quando a dependência trava é o oposto do que ele
 * serve.
 */
export interface PlatformHealthProbe {
  snapshot(): Promise<PlatformHealthSnapshot>;
}
