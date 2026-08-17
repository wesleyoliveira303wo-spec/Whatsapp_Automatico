import {
  CampaignMessageSender,
  CampaignMessageSendResult,
} from '../../campaigns/domain/providers/CampaignMessageSender';
import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';
import { Logger } from '../../../shared/domain/Logger';

/**
 * Implementação real do port `CampaignMessageSender` (`services/campaigns/domain`)
 * — Fase L, Bloco L4. Vive em `services/whatsapp/infrastructure` porque
 * precisa do `WhatsAppConnectionRegistry` (único dono dos sockets, ADR #54);
 * importa `ConversationRepository`/`MessageRepository` de `conversations` —
 * MESMO precedente já estabelecido por `OutboundCommandConsumer` (Milestone
 * 3, Bloco 4), não uma exceção nova.
 *
 * **Nunca envia para um contato sem conversa prévia nesta sessão.** Resolve
 * o `contactJid` de envio EXCLUSIVAMENTE a partir de uma
 * `WhatsAppConversation` já existente
 * (`ConversationRepository.findByContactAndSession`) — nunca reconstruído a
 * partir do telefone canônico do contato. Sem conversa prévia, devolve
 * `ok: false` em vez de tentar adivinhar um endereço: é este filtro que
 * restringe o L4 a REENGAJAMENTO de conversas reais (decisão registrada em
 * `FASE_L_MOTOR_DE_LEADS.md` §20 — "L4 dispara primeiro contra a base
 * própria... não contra lista importada").
 */
export class WhatsAppCampaignMessageSender implements CampaignMessageSender {
  constructor(
    private readonly registry: WhatsAppConnectionRegistry,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly logger: Logger,
  ) {}

  async send(
    tenantId: string,
    sessionName: string,
    contactId: string,
    content: string,
  ): Promise<CampaignMessageSendResult> {
    const conversation = await this.conversationRepository.findByContactAndSession(
      tenantId,
      sessionName,
      contactId,
    );
    if (!conversation) {
      return { ok: false, failureReason: 'sem_conversa_existente_nesta_sessao' };
    }

    try {
      const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
      await sessionManager.sendMessage(conversation.contactJid, content);
    } catch (error) {
      this.logger.warn('Falha ao enviar mensagem de campanha via WhatsApp', {
        tenantId,
        sessionName,
        contactId,
        conversationId: conversation.id,
        error,
      });
      return {
        ok: false,
        failureReason: error instanceof Error ? error.message : 'erro_ao_enviar',
      };
    }

    // A dedupe de ENVIO já aconteceu na camada da fila (`jobId=recipientId`,
    // §9.4) — `Message.create()` não recebe/precisa de nenhuma chave de
    // idempotência própria (essa noção existe só em `OutboundMessageCommand`,
    // do fluxo de IA/operador, não faz parte da entidade `Message`).
    await this.messageRepository.create({
      tenantId,
      conversationId: conversation.id,
      direction: 'outbound',
      content,
      contentType: 'text',
      occurredAt: new Date(),
    });

    return { ok: true, conversationId: conversation.id };
  }
}
