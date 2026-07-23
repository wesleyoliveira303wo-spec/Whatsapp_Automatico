import { WhatsAppSession } from './WhatsAppSession';
import { WhatsAppDisconnectReason } from './WhatsAppDisconnectReason';

/**
 * Registro histórico (append-only) de uma transição de status de uma sessão
 * do WhatsApp — M2, Fase 2 (M2-B4), suporte à tela de histórico do
 * Dashboard.
 *
 * Deliberadamente uma entidade SEPARADA de `WhatsAppSession`, não uma
 * versão "com log" dela: `WhatsAppSession` é o estado ATUAL (uma linha por
 * sessão lógica, sobrescrita a cada transição); `WhatsAppSessionEvent` é o
 * HISTÓRICO (uma linha por transição, nunca sobrescrita/apagada). Mesma
 * separação já usada no domínio legado entre `Conversation` e
 * `ConversationEvent` (`prisma/schema.prisma`) — reaproveita um padrão já
 * validado no projeto, não inventa um novo.
 *
 * Por que `tenantId`/`sessionName` (não `sessionId`): sobrevive
 * deliberadamente à remoção da sessão (`WhatsAppSessionService.removeSession()`,
 * M2 Fase 1) — remover uma sessão apaga a linha de `WhatsAppSession`
 * (`deleteByTenantAndSessionName`), mas o histórico de quando ela existiu
 * deve continuar consultável. Uma FK para `WhatsAppSession.id` forçaria
 * `onDelete: Cascade` (apagando o histórico junto) ou `onDelete: SetNull`
 * (quebrando a rastreabilidade de qual sessão gerou cada evento) — nenhuma
 * das duas serve a um log de auditoria. Mesmo racional já registrado para
 * `TenantCredential` não ter FK para `WhatsAppSession` (ver `schema.prisma`).
 */
export interface WhatsAppSessionEvent {
  id: string;
  tenantId: string;
  sessionName: string;
  status: WhatsAppSession['status'];
  disconnectReason?: WhatsAppDisconnectReason;
  occurredAt: Date;
}
