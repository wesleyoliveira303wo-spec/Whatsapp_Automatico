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
export interface GroupBroadcastSendJobData {
  tenantId: string;
  broadcastId: string;
  targetId: string;
}
