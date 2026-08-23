import {
  CampaignMessageSender,
  CampaignMessageSendResult,
  CampaignSendRecipient,
  CampaignSendMedia,
} from '../../campaigns/domain/providers/CampaignMessageSender';
import { ContactPhoneLookup } from '../../campaigns/domain/providers/ContactPhoneLookup';
import { ConversationRepository } from '../../conversations/domain/repositories/ConversationRepository';
import { MessageRepository } from '../../conversations/domain/repositories/MessageRepository';
import { AgentMediaCache } from '../../conversations/infrastructure/AgentMediaCache';
import { WhatsAppConnectionRegistry } from '../application/WhatsAppConnectionRegistry';
import { WhatsAppNotConnectedError } from '../domain/errors/WhatsAppNotConnectedError';
import { Logger } from '../../../shared/domain/Logger';

/** Retentativas para `WhatsAppNotConnectedError` — mesmo espírito/valores de `GeminiAiProvider` (2026-07-31). */
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 5000;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CampaignSendRetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  sleepFn?: (ms: number) => Promise<void>;
}

/**
 * Implementação real do port `CampaignMessageSender` (`services/campaigns/domain`)
 * — Fase L, Blocos L4/L5. Vive em `services/whatsapp/infrastructure` porque
 * precisa do `WhatsAppConnectionRegistry` (único dono dos sockets, ADR #54);
 * importa `ConversationRepository`/`MessageRepository` de `conversations` —
 * MESMO precedente já estabelecido por `OutboundCommandConsumer` (Milestone
 * 3, Bloco 4), não uma exceção nova.
 *
 * **Dois caminhos (ver docstring do port para o desenho completo):**
 * reengajamento (usa o `contactJid` de uma conversa já existente) e primeiro
 * contato (Bloco L5 — resolve um telefone, envia, e CRIA a conversa com
 * `stage: 'contacted'`). `contactPhoneLookup` é OPCIONAL (mesmo padrão de
 * `campaignSendDispatcher`/`contactLookup` em `CampaignService`): sem ele, um
 * Contato vinculado sem conversa prévia simplesmente não consegue ser
 * resolvido para o primeiro contato — falha com `ok:false`, nunca quebra.
 *
 * RETRY (2026-08-18, achado real: metade dos disparos de uma campanha
 * pequena caiu em `WhatsAppNotConnectedError` — a mesma instabilidade
 * momentânea de conexão já corrigida com retentativa em `whatsapp-outbound`,
 * ver `AiReplyJobProcessor`/`OutboundCommandConsumer`). Diferente daquela
 * fila, `campaign-send` não pode simplesmente ganhar `attempts` no BullMQ:
 * `CampaignSendJobProcessor` já marca o destinatário `FAILED` na primeira
 * tentativa (camada 3 de idempotência, §9.4) — uma retentativa do BullMQ
 * releria esse `FAILED` e desistiria sem nunca reenviar. A retentativa
 * precisa acontecer AQUI DENTRO, antes do resultado (sucesso/falha) sair
 * deste método — mesmo padrão/mesmos valores já usados em `GeminiAiProvider`.
 * Só retenta `WhatsAppNotConnectedError` (transitório, resolve sozinho em
 * segundos); qualquer outro erro (número inválido, etc.) falha na hora.
 *
 * MÍDIA (Fase L, Bloco L8, 2026-08-20) — `send()` recebe o binário JÁ
 * RESOLVIDO (`CampaignSendMedia`, opcional); quando presente, `content` vira
 * a legenda e o envio usa `SessionManager.sendMediaMessage` no lugar de
 * `sendMessage` — mesmo método que `WhatsAppMediaSender` (F1.3) usa, sem
 * precisar de um port próprio: esta classe já tem `WhatsAppConnectionRegistry`
 * em escopo.
 */
export class WhatsAppCampaignMessageSender implements CampaignMessageSender {
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(
    private readonly registry: WhatsAppConnectionRegistry,
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly logger: Logger,
    retryOptions: CampaignSendRetryOptions = {},
    private readonly contactPhoneLookup?: ContactPhoneLookup,
    /**
     * CORREÇÃO 2026-08-20 (bug real, achado no primeiro disparo de campanha
     * com imagem): sem popular este cache, `ConversationsService.getMessageMedia`
     * nunca encontra o binário de volta para a prévia da Dashboard — mídia
     * enviada por NÓS nunca tem `mediaKeyEncrypted` real (ADR #90), então o
     * fallback (`mediaDownloader.download()`) tenta descriptografar uma
     * chave VAZIA e lança "Invalid initialization vector". MESMA instância
     * usada por `ConversationsService` (injetada por `index.ts`, ver
     * docstring de `agentMediaCache` em `ConversationsComposition`) — OPCIONAL
     * (mesmo padrão de `contactPhoneLookup`): sem ela, o envio continua
     * funcionando, só a prévia na Dashboard fica sem imagem.
     */
    private readonly agentMediaCache?: AgentMediaCache,
  ) {
    this.maxRetries = retryOptions.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = retryOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.sleepFn = retryOptions.sleepFn ?? defaultSleep;
  }

  async send(
    tenantId: string,
    sessionName: string,
    recipient: CampaignSendRecipient,
    content: string,
    media?: CampaignSendMedia,
  ): Promise<CampaignMessageSendResult> {
    const existingConversation = recipient.contactId
      ? await this.conversationRepository.findByContactAndSession(
          tenantId,
          sessionName,
          recipient.contactId,
        )
      : undefined;

    if (existingConversation) {
      return this.sendToConversation(
        tenantId,
        sessionName,
        existingConversation.id,
        existingConversation.contactJid,
        content,
        media,
      );
    }

    // Bloco L5 — sem conversa prévia, resolve um telefone para o PRIMEIRO
    // contato. Destinatário "solto" já traz `phoneE164` direto; um Contato
    // vinculado que nunca conversou nesta sessão precisa de uma busca.
    let phoneE164 = recipient.phoneE164;
    let name = recipient.name;
    if (!phoneE164 && recipient.contactId) {
      const contact = await this.contactPhoneLookup?.findPhoneById(tenantId, recipient.contactId);
      if (!contact) {
        return { ok: false, failureReason: 'contato_sem_telefone_resolvivel' };
      }
      phoneE164 = contact.phoneE164;
      name = name ?? contact.name;
    }
    if (!phoneE164) {
      return { ok: false, failureReason: 'sem_telefone_para_envio' };
    }

    const contactJid = `${phoneE164}@s.whatsapp.net`;

    try {
      await this.sendWithRetry(tenantId, sessionName, contactJid, content, media);
    } catch (error) {
      this.logger.warn('Falha ao enviar mensagem de campanha via WhatsApp (primeiro contato)', {
        tenantId,
        sessionName,
        contactId: recipient.contactId,
        phoneE164,
        error,
      });
      return {
        ok: false,
        failureReason: error instanceof Error ? error.message : 'erro_ao_enviar',
      };
    }

    // Foi a empresa quem procurou primeiro — a conversa nasce em `contacted`,
    // não `new` (ver docstring do port). `upsertByTenantSessionAndContact` é
    // idempotente: se por acaso já existir uma conversa com este `contactJid`
    // (ex.: a pessoa escreveu por conta própria entre a materialização e o
    // envio), devolve a existente em vez de duplicar.
    const conversation = await this.conversationRepository.upsertByTenantSessionAndContact(
      tenantId,
      sessionName,
      contactJid,
      {
        id: crypto.randomUUID(),
        tenantId,
        sessionName,
        contactJid,
        contactName: name,
        contactId: recipient.contactId,
        status: 'bot',
        unreadCount: 0,
        stage: 'contacted',
        stageSetBy: 'ai',
        stageUpdatedAt: new Date(),
        excludedFromPipeline: false,
        aiSummaryMessageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: [],
      },
    );

    await this.createMessageAndCacheMedia(tenantId, conversation.id, content, media);

    return { ok: true, conversationId: conversation.id };
  }

  private async sendToConversation(
    tenantId: string,
    sessionName: string,
    conversationId: string,
    contactJid: string,
    content: string,
    media?: CampaignSendMedia,
  ): Promise<CampaignMessageSendResult> {
    try {
      await this.sendWithRetry(tenantId, sessionName, contactJid, content, media);
    } catch (error) {
      this.logger.warn('Falha ao enviar mensagem de campanha via WhatsApp', {
        tenantId,
        sessionName,
        conversationId,
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
    await this.createMessageAndCacheMedia(tenantId, conversationId, content, media);

    return { ok: true, conversationId };
  }

  /**
   * Fase L, Bloco L8 — cria a `Message` (com ou sem mídia) e, quando há
   * mídia, popula `agentMediaCache` com o binário. Mesma disciplina de
   * `ConversationsService.sendAgentMediaMessage` (F1.3): `content` é a
   * LEGENDA (nunca uma segunda mensagem), e `url`/`mediaKeyEncrypted` ficam
   * vazios de propósito — mídia enviada por NÓS (operador ou campanha) nunca
   * tem referência real ao CDN do WhatsApp, essa referência só existe para
   * mídia RECEBIDA (ADR #90). CORREÇÃO 2026-08-20: sem o `.set()` abaixo, a
   * prévia da imagem na Dashboard falhava com "Invalid initialization
   * vector" (ver docstring de `agentMediaCache` no construtor).
   */
  private async createMessageAndCacheMedia(
    tenantId: string,
    conversationId: string,
    content: string,
    media?: CampaignSendMedia,
  ): Promise<void> {
    const message = await this.messageRepository.create({
      tenantId,
      conversationId,
      direction: 'outbound',
      content,
      contentType: media?.contentType ?? 'text',
      ...(media
        ? { media: { mimeType: media.mimeType, url: '', mediaKeyEncrypted: '', fileName: media.fileName } }
        : {}),
      occurredAt: new Date(),
    });
    if (media) {
      this.agentMediaCache?.set(tenantId, message.id, {
        mimeType: media.mimeType,
        fileName: media.fileName,
        data: media.buffer,
      });
    }
  }

  /**
   * Chama `sessionManager.sendMessage`, retentando só em
   * `WhatsAppNotConnectedError` — ver docstring da classe. Backoff fixo
   * (não exponencial, ao contrário de `GeminiAiProvider`): a instabilidade
   * observada é uma reconexão de segundos, não uma sobrecarga que piora com
   * o tempo; `DEFAULT_RETRY_DELAY_MS` já cobre a janela real observada.
   */
  private async sendWithRetry(
    tenantId: string,
    sessionName: string,
    contactJid: string,
    content: string,
    media?: CampaignSendMedia,
  ): Promise<void> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const sessionManager = this.registry.getOrCreate(tenantId, sessionName);
        if (media) {
          // `content` vira a LEGENDA — uma mensagem só, nunca duas (ver
          // docstring de `CampaignSendMedia`).
          await sessionManager.sendMediaMessage(contactJid, { ...media, caption: content });
        } else {
          await sessionManager.sendMessage(contactJid, content);
        }
        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        if (!(error instanceof WhatsAppNotConnectedError) || isLastAttempt) {
          throw error;
        }
        this.logger.warn(
          'Envio de campanha encontrou sessão momentaneamente desconectada — retentando',
          { tenantId, sessionName, attempt: attempt + 1, maxRetries: this.maxRetries },
        );
        await this.sleepFn(this.retryDelayMs);
      }
    }
  }
}
