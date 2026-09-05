/**
 * Read model de UMA pergunta que a IA não soube responder — Bloco B3
 * (issue #14), a camada de leitura que faltava sobre o dado que a Fase 1,
 * Bloco F1.4 (ADR #95) já passou a gravar.
 *
 * NÃO é uma entidade nova de Domain: nada aqui é persistido com esta forma.
 * É a projeção de três tabelas que a Infrastructure junta numa consulta só
 * (`ai_interactions` → `whatsapp_conversations` → `whatsapp_messages`),
 * exatamente como `PrismaAnalyticsRepository` já faz para relatórios —
 * leitura que cruza tabelas, nunca dependência de escrita entre bounded
 * contexts.
 *
 * O porquê de existir: `AiInteraction` sozinho registra QUE a IA travou,
 * mas não O QUE foi perguntado — a pergunta mora na `Message` inbound
 * apontada por `messageId`, e quem é o cliente mora na `Conversation`. Uma
 * tela que listasse só `AiInteraction` mostraria uma lista de ids, inútil
 * para o operador que precisa decidir o que ensinar à IA.
 */
export interface UnansweredQuestion {
  /** `AiInteraction.id` — a tentativa de geração em que a IA sinalizou a lacuna. */
  interactionId: string;
  conversationId: string;
  /** Sempre presente: vem do JOIN obrigatório com a conversa. */
  sessionName: string;
  /**
   * Texto da mensagem inbound que originou a interação. Ausente quando
   * `AiInteraction.messageId` é `null` (interações gravadas antes do F1.4)
   * ou quando a mensagem foi apagada — a UI precisa tratar essa ausência,
   * nunca assumir que sempre há pergunta.
   */
  questionText?: string;
  contactJid: string;
  /** `pushName` do WhatsApp (M6H-2b) — pode não existir. */
  contactName?: string;
  /** Nome salvo na aba Contatos (Fase L, Bloco L1) — tem prioridade na exibição. */
  savedContactName?: string;
  /** Quando a IA travou (`AiInteraction.createdAt`). */
  occurredAt: Date;
}
