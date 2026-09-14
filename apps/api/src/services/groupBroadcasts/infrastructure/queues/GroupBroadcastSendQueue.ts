/**
 * Fila BullMQ `group-broadcast-send` — Disparos em grupos (2026-09-11). NOVA e
 * separada de `campaign-send`/`whatsapp-outbound` pelo mesmo motivo que separou
 * `campaign-send` da fila de respostas (Fase L §9.2): perfil de tráfego
 * próprio (lento, espaçado, ninguém esperando) e, aqui, um disjuntor próprio —
 * misturar com campanhas 1:1 embaralharia os dois ritmos.
 *
 * Consumida exclusivamente DENTRO de `apps/api` (único dono dos sockets, ADR
 * #54), nunca em `worker.ts`.
 */
export const GROUP_BROADCAST_SEND_QUEUE_NAME = 'group-broadcast-send';

export const GROUP_BROADCAST_SEND_JOB_NAME = 'send-group-message';

/** O suficiente para o processor RECARREGAR disparo e alvo do banco — nunca confia no payload para decidir enviar. */
/**
 * Segundo tipo de job da MESMA fila (2026-09-11): iniciar a PRÓXIMA repetição
 * de um disparo recorrente. Fica aqui, e não numa fila nova, pelo mesmo motivo
 * do `classify-stage` na fila `ai-reply`: o worker, a conexão e a
 * observabilidade já existem.
 */
export const GROUP_BROADCAST_RUN_JOB_NAME = 'start-group-broadcast-run';

export interface GroupBroadcastRunJobData {
  tenantId: string;
  broadcastId: string;
  /** Qual etapa esta repetição é de — desde 2026-09-14, etapas rodam em paralelo, cada uma com seu próprio ciclo. */
  stepId: string;
  /** Número da repetição que este job inicia (1 = a primeira). Só para log/idempotência. */
  runNumber: number;
}

export interface GroupBroadcastSendJobData {
  tenantId: string;
  broadcastId: string;
  stepId: string;
  /** Id do `GroupBroadcastStepTarget` (progresso de UM grupo em UMA etapa), não mais do alvo campanha-wide. */
  stepTargetId: string;
}
