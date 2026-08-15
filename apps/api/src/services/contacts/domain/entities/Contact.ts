/**
 * Como um contato entrou no sistema — espelha o enum `ContactSource` do
 * Prisma. União literal, não `string`, pelo mesmo racional do achado F6/ADR
 * #15 já aplicado a `WhatsAppConversationStatus`/`ConversationStage`.
 */
export type ContactSource = 'whatsapp' | 'import' | 'manual';

/**
 * Identidade durável de uma pessoa dentro de um tenant — Fase L, Bloco L1.
 *
 * Interface de dados simples (sem métodos), mesmo estilo de `Conversation`/
 * `Message`/`WhatsAppSession`: as regras vivem em funções puras de Domain
 * (`phoneNumber.ts`), não na entidade.
 *
 * `phoneE164` é a chave de identidade, na forma canônica de
 * `normalizePhoneToE164` — nunca o endereço de envio (ver a docstring daquele
 * módulo e a do model no `schema.prisma`).
 *
 * `name` é o nome que o OPERADOR deu ao lead, e é intencionalmente diferente
 * de `Conversation.contactName` (o `pushName` que o contato escolheu no
 * WhatsApp dele, que muda sem aviso). Um contato criado automaticamente a
 * partir de uma conversa nasce sem `name`: naquele instante ninguém escolheu
 * nome nenhum.
 */
export interface Contact {
  id: string;
  tenantId: string;
  phoneE164: string;
  name?: string;
  source: ContactSource;
  createdAt: Date;
  updatedAt: Date;
}
