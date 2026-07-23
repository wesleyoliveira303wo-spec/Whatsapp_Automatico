import type { WhatsAppDisconnectReason, WhatsAppSessionStatus } from './clientApi';

/**
 * Funções puras de formatação (M2, Fase 4 — UI). Deliberadamente sem
 * nenhuma dependência de React/DOM: são o único pedaço de lógica da Fase 4
 * testável no ambiente de testes atual (`testEnvironment: 'node'`, sem
 * jsdom — ver auto-auditoria da entrega para a justificativa completa de
 * por que os componentes React em si não ganharam testes automatizados
 * nesta fase). Cada função aqui tem uma entrada/saída determinística, sem
 * estado, sem I/O — o tipo de lógica que mais vale a pena isolar do JSX.
 */

const STATUS_LABELS: Record<WhatsAppSessionStatus, string> = {
  connected: 'Conectado',
  connecting: 'Conectando…',
  disconnected: 'Desconectado',
};

const STATUS_BADGE_CLASSES: Record<WhatsAppSessionStatus, string> = {
  connected: 'bg-green-100 text-green-800',
  connecting: 'bg-yellow-100 text-yellow-800',
  disconnected: 'bg-gray-200 text-gray-700',
};

const DISCONNECT_REASON_LABELS: Record<WhatsAppDisconnectReason, string> = {
  logged_out: 'Desconectado pelo celular (logout)',
  restart_required: 'Reinício exigido pelo protocolo',
  connection_lost: 'Conexão perdida',
  timed_out: 'Tempo de conexão esgotado',
  unknown: 'Motivo desconhecido',
};

export function formatStatusLabel(status: WhatsAppSessionStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function statusBadgeClassName(status: WhatsAppSessionStatus): string {
  return STATUS_BADGE_CLASSES[status] ?? 'bg-gray-200 text-gray-700';
}

export function formatDisconnectReasonLabel(reason: WhatsAppDisconnectReason | undefined): string | undefined {
  if (!reason) return undefined;
  return DISCONNECT_REASON_LABELS[reason] ?? reason;
}

/**
 * Formata uma data ISO 8601 (formato em que `apps/api` sempre serializa
 * `Date` via `JSON.stringify` — nunca chega ao browser como `Date` de
 * verdade) para `pt-BR`. Devolve `'—'` para `undefined`/string inválida —
 * evita espalhar esse guard em cada componente que exibe uma data opcional
 * (`connectedAt`, `lastSeen`).
 */
export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}

// --- Milestone 3, Bloco 6 (D24/D27/D28): formatadores de conversas/IA ---
// Mesmo racional da secao acima (M2, Fase 4): funcoes puras, sem React/DOM,
// testaveis em `testEnvironment: 'node'` (D29).

import type { ConversationStatus, AiInteractionStatus } from './clientApi';

const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  bot: 'Bot respondendo',
  human: 'Atendimento humano',
};

const CONVERSATION_STATUS_CLASSES: Record<ConversationStatus, string> = {
  bot: 'bg-green-100 text-green-800',
  human: 'bg-amber-100 text-amber-800',
};

export function formatConversationStatusLabel(status: ConversationStatus): string {
  return CONVERSATION_STATUS_LABELS[status] ?? status;
}

export function conversationStatusBadgeClassName(status: ConversationStatus): string {
  return CONVERSATION_STATUS_CLASSES[status] ?? 'bg-gray-200 text-gray-700';
}

const AI_INTERACTION_STATUS_LABELS: Record<AiInteractionStatus, string> = {
  success: 'Sucesso',
  validation_rejected: 'Resposta rejeitada na validacao',
  provider_error: 'Erro do provider',
};

const AI_INTERACTION_STATUS_CLASSES: Record<AiInteractionStatus, string> = {
  success: 'bg-green-100 text-green-800',
  validation_rejected: 'bg-amber-100 text-amber-800',
  provider_error: 'bg-red-100 text-red-800',
};

export function formatAiInteractionStatusLabel(status: AiInteractionStatus): string {
  return AI_INTERACTION_STATUS_LABELS[status] ?? status;
}

export function aiInteractionStatusBadgeClassName(status: AiInteractionStatus): string {
  return AI_INTERACTION_STATUS_CLASSES[status] ?? 'bg-gray-200 text-gray-700';
}

/**
 * Exibe o JID do WhatsApp de forma legivel: `5511999999999@s.whatsapp.net`
 * vira `5511999999999`. Nao tenta formatar como telefone (E.164 com
 * mascara) — o JID nao e garantidamente um numero discavel em todos os
 * casos, e uma mascara errada seria pior que o valor cru.
 */
export function formatContactJid(contactJid: string): string {
  const atIndex = contactJid.indexOf('@');
  return atIndex > 0 ? contactJid.slice(0, atIndex) : contactJid;
}

/** Custo em USD para exibicao: `costUsd` chega como string decimal exata (nunca number — Bloco 3b); exibe com prefixo e sem cortar precisao. */
export function formatCostUsd(costUsd: string): string {
  return `US$ ${costUsd}`;
}
