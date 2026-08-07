import { Message } from '../entities/Message';

/**
 * Porta (port) de persistência de `Message` — Milestone 3, Bloco 2
 * (`create`) + Bloco 4 (`listRecentByConversation`, aditivo — a leitura de
 * histórico antecipada, mas não implementada, desde o Bloco 2).
 */
export interface MessageRepository {
  /**
   * Persiste uma nova mensagem. `id` é gerado pela implementação (mesmo
   * padrão de `WhatsAppSessionEventRepository.append`, que também omite `id`
   * do parâmetro) — mas, diferente de `append()` (que devolve `void`), este
   * método devolve a `Message` criada: `MessageIngestionService` precisa do
   * `id` gerado para repassar a `AiReplyScheduler.schedule(...)`.
   */
  create(message: Omit<Message, 'id'>): Promise<Message>;

  /**
   * Busca UMA mensagem por `id`, escopada a `tenantId` (Fase 1, Bloco F1.1,
   * ADR #90) — usado pela rota de download de mídia
   * (`GET .../messages/:messageId/media`), que precisa resolver a
   * referência `Message.media` de uma mensagem específica antes de chamar
   * `MediaDownloader`. Devolve `undefined` quando a mensagem não existe OU
   * pertence a outro tenant — nunca lança (mesma defesa em profundidade já
   * documentada em `listRecentByConversation`).
   */
  findById(tenantId: string, messageId: string): Promise<Message | undefined>;

  /**
   * Devolve até `limit` mensagens mais recentes de uma conversa, DO MAIS
   * NOVO PARA O MAIS ANTIGO (`orderBy: { occurredAt: 'desc' }`) — mesma
   * convenção já usada por
   * `WhatsAppSessionEventRepository.listRecentByTenantAndSessionName`
   * (Milestone 2). Milestone 3, Bloco 4: usado pelo worker de IA para
   * montar o histórico que `PromptBuilder.build()` recebe.
   *
   * Deliberadamente NÃO devolve em ordem cronológica ascendente: mantém o
   * mesmo contrato de "recente primeiro" já estabelecido no projeto para
   * todo método `listRecentBy*`, em vez de um contrato próprio só para este
   * método. Inverter para ordem cronológica (mais antiga primeiro — o que
   * `PromptBuilder`/`AiGenerationRequest` exigem, já que cada mensagem vira
   * um turno de conversa em ordem) é responsabilidade de quem CHAMA este
   * método (o worker), não deste repositório — mesmo racional já registrado
   * em `PromptBuilder.ts`: "quem busca o histórico e decide QUANTAS
   * mensagens passar é responsabilidade de quem chama build()".
   *
   * `tenantId` é redundante com o `tenantId` já embutido em cada `Message`
   * de uma `conversationId` (uma conversa pertence a um único tenant), mas
   * recebido explicitamente mesmo assim — mesmo racional de defesa em
   * profundidade já usado em `WhatsAppSessionEventRepository.
   * listRecentByTenantAndSessionName(tenantId, sessionName, limit)`: a
   * implementação real filtra por AMBOS, nunca confia só no
   * `conversationId` vindo de fora para decidir o que pertence a qual
   * tenant.
   */
  listRecentByConversation(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<Message[]>;
}
