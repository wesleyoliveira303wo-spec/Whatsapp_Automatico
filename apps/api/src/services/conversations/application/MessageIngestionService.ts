import { MessageReceivedHandler, InboundWhatsAppMessage } from '../../whatsapp/domain/handlers/MessageReceivedHandler';
import { ConversationRepository } from '../domain/repositories/ConversationRepository';
import { MessageRepository } from '../domain/repositories/MessageRepository';
import { AiReplyScheduler } from '../domain/schedulers/AiReplyScheduler';
import { shouldAutoRespond } from '../domain/policies/shouldAutoRespond';

/**
 * Implementa `MessageReceivedHandler` (porta de `services/whatsapp/domain`,
 * Bloco 1) — é o ÚNICO ponto de contato entre `services/whatsapp` e
 * `services/conversations`, injetado opcionalmente em `SessionManager`
 * (ainda não wired em nenhum composition root real; isso é Bloco 5).
 *
 * Fluxo de `handle()` (Milestone 3, Bloco 2 — ver
 * `MILESTONE_003_AI_AUTORESPONDER.md` §3):
 * 1. Encontra ou cria a `Conversation` de (`tenantId`, `sessionName`,
 *    `from`) — atomicamente, via `ConversationRepository.upsertByTenantSessionAndContact`.
 * 2. Persiste a `Message` inbound.
 * 3. Se a conversa ainda estiver em modo `'bot'` (`shouldAutoRespond`),
 *    agenda uma resposta de IA via `AiReplyScheduler.schedule(...)` — nunca
 *    chama nenhum serviço de IA diretamente (§2.1: "`MessageIngestionService`
 *    e `ConversationAiService` NUNCA se chamam diretamente").
 *
 * Erros de qualquer uma das três etapas propagam para cima: `SessionManager`
 * (Bloco 1) já envolve a chamada a `MessageReceivedHandler.handle()` num
 * try/catch que loga a falha sem deixar propagar para o restante do fluxo de
 * eventos do provider — não há necessidade de duplicar esse tratamento aqui.
 */
export class MessageIngestionService implements MessageReceivedHandler {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly aiReplyScheduler: AiReplyScheduler,
  ) {}

  async handle(message: InboundWhatsAppMessage): Promise<void> {
    const conversation = await this.conversationRepository.upsertByTenantSessionAndContact(
      message.tenantId,
      message.sessionName,
      message.from,
      {
        id: crypto.randomUUID(),
        tenantId: message.tenantId,
        sessionName: message.sessionName,
        contactJid: message.from,
        status: 'bot',
        createdAt: message.receivedAt,
        updatedAt: message.receivedAt,
      },
    );

    const createdMessage = await this.messageRepository.create({
      tenantId: message.tenantId,
      conversationId: conversation.id,
      direction: 'inbound',
      content: message.content,
      occurredAt: message.receivedAt,
    });

    if (shouldAutoRespond(conversation)) {
      await this.aiReplyScheduler.schedule(message.tenantId, conversation.id, createdMessage.id);
    }
  }
}
