/**
 * Conversa lógica entre um contato do WhatsApp e um tenant — Milestone 3,
 * Bloco 2. Chave lógica única: `tenantId` + `sessionName` + `contactJid` (ver
 * `@@unique` em `prisma/schema.prisma`, model `WhatsAppConversation`).
 *
 * `status` controla se a IA responde automaticamente a novas mensagens desta
 * conversa (`'bot'`) ou se um humano assumiu o atendimento (`'human'`) — ver
 * `domain/policies/shouldAutoRespond.ts`. Tipado como união literal, não
 * `string` livre, mesmo racional do achado F6/ADR #15 já aplicado a
 * `WhatsAppSession.status`/`WhatsAppSession.provider`. Nenhuma operação desta
 * Milestone (Bloco 2) ainda MUDA `status` para `'human'` — essa é uma
 * capacidade do Bloco 5 (endpoint `POST .../conversations/:id/escalate`); o
 * campo já existe aqui porque `MessageIngestionService` (Bloco 2) precisa
 * LER esse estado para decidir se agenda uma resposta de IA.
 */
export interface Conversation {
  id: string;
  tenantId: string;
  sessionName: string;
  contactJid: string;
  status: 'bot' | 'human';
  /**
   * Dono atual do atendimento (Milestone 5, Bloco M5D — ownership, D57): o
   * `userId` de quem ASSUMIU a conversa (`escalate`), ou `undefined` quando
   * ninguem assumiu (ex.: conversa nova, ou retomada pelo bot). Coluna
   * aditiva criada no M5A; passa a ser preenchida/lida a partir do M5D.
   * Referencia por id (sem entidade `User` — o contexto de conversas nao
   * conhece o de auth), mesmo principio de `AiInteraction.conversationId`.
   */
  assignedToUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}
