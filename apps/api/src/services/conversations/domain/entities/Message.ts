/**
 * Uma mensagem (inbound ou outbound) dentro de uma `Conversation` —
 * Milestone 3, Bloco 2. Registro append-only: uma vez criada, nunca é
 * atualizada — mesmo espírito de `WhatsAppSessionEvent` (log imutável), por
 * isso não expõe `updatedAt`.
 *
 * `direction` tipado como união literal, não `string` livre (mesmo racional
 * do F6/ADR #15). Só `'inbound'` é produzida pelo Bloco 2
 * (`MessageIngestionService`); `'outbound'` existe desde já porque é
 * inerente ao que uma "mensagem" é neste domínio (uma conversa tem os dois
 * sentidos por definição) — o BLOCO que vai de fato criar uma `Message`
 * `'outbound'` (a resposta gerada pela IA, após validação) é o Bloco 4, não
 * antecipado aqui.
 *
 * `occurredAt` é o instante de negócio (quando a mensagem foi recebida pelo
 * WhatsApp/enviada pela IA) — deliberadamente distinto de "quando esta linha
 * foi persistida" (que fica só no model Prisma, não exposto aqui), mesmo
 * padrão já usado em `WhatsAppSessionEvent.occurredAt`.
 */
export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  occurredAt: Date;
}
