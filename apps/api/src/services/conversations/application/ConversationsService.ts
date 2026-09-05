import { randomUUID } from 'crypto';

import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { Tenant } from '../../../shared/tenant/domain/Tenant';
import { planPermiteUso } from '../../../shared/tenant/domain/planPermiteUso';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import { OutboundMessageDispatcher } from '../../whatsapp/domain/dispatchers/OutboundMessageDispatcher';
import { MediaDownloader } from '../../whatsapp/domain/providers/MediaDownloader';
import { MediaSender } from '../../whatsapp/domain/providers/MediaSender';
import { Conversation } from '../domain/entities/Conversation';
import { Message, MessageContentType } from '../domain/entities/Message';
import {
  ConversationRepository,
  ConversationPage,
} from '../domain/repositories/ConversationRepository';
import { MessageRepository } from '../domain/repositories/MessageRepository';
import { ConversationNotFoundError } from '../domain/errors/ConversationNotFoundError';
import { ConversationOwnershipError } from '../domain/errors/ConversationOwnershipError';
import { ConversationNotHumanError } from '../domain/errors/ConversationNotHumanError';
import { AgentReplyRequiresPaidPlanError } from '../domain/errors/AgentReplyRequiresPaidPlanError';
import { ConversationContactUnavailableError } from '../domain/errors/ConversationContactUnavailableError';
import { ContactResolver } from '../domain/repositories/ContactResolver';
import { MessageMediaNotFoundError } from '../domain/errors/MessageMediaNotFoundError';
import { AgentMediaTooLargeError } from '../domain/errors/AgentMediaTooLargeError';
import { AgentMediaTypeMismatchError } from '../domain/errors/AgentMediaTypeMismatchError';
import { isDeclaredMediaCategoryImplausible, sniffMediaCategory } from '../domain/mediaMagicBytes';
import { AgentMediaCache } from '../infrastructure/AgentMediaCache';

/**
 * Teto de tamanho para mídia enviada PELO OPERADOR — Fase 1, Bloco F1.3.
 * 16MB é o limite prático que o próprio WhatsApp aplica à maioria dos tipos
 * de mídia (documentos/vídeos); imagens/áudios costumam ser bem menores na
 * prática, mas não há necessidade de um teto por tipo nesta rodada (YAGNI —
 * o WhatsApp já rejeita do lado dele se o arquivo for grande demais para o
 * tipo). Diferente de `MAX_MEDIA_BYTES_FOR_AI` (10MB, `ConversationAiService`,
 * Bloco F1.2) — aquele é um controle de CUSTO de IA multimodal, não de
 * protocolo; os dois valores são independentes de propósito.
 */
export const MAX_AGENT_MEDIA_UPLOAD_BYTES = 16 * 1024 * 1024;

/** Milestone 3, Bloco 5 (D11) — default/teto de `listConversations()`, mesmo padrão de `WhatsAppSessionService`. */
const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 200;

/** Milestone 3, Bloco 5 (D12) — default/teto de `listMessages()`. */
const DEFAULT_MESSAGES_LIMIT = 50;
const MAX_MESSAGES_LIMIT = 200;

export interface ListConversationsOptions {
  status?: Conversation['status'];
  limit?: number;
  cursor?: string;
  /** Milestone 6, Bloco M6H-2 — filtra por sessão de WhatsApp (ver `ConversationRepository.FindAllByTenantOptions`). */
  sessionName?: string;
  /** Reforma do escalonamento (2026-07-25) — filtra só conversas com `escalatedAt` definido (ver `ConversationRepository.FindAllByTenantOptions`). */
  needsHumanAttention?: boolean;
  /** Filtro "Aguardando" da inbox (2026-09-05) — ver o port. */
  awaitingOrInHumanCare?: boolean;
  /** ADR #94 (2026-08-01) — filtra por dentro/fora do funil comercial (ver `ConversationRepository.FindAllByTenantOptions`). Ausente = sem filtro. */
  excludedFromPipeline?: boolean;
  /**
   * Menu "⋮" da conversa (2026-08-29) — filtra por arquivada/não arquivada
   * (ver `ConversationRepository.FindAllByTenantOptions`). Diferente de
   * `excludedFromPipeline`: aqui SEMPRE há um valor efetivo — default
   * `false` (não arquivadas), nunca "sem filtro".
   */
  archived?: boolean;
}

/**
 * Quem está executando a ação (Milestone 5, Bloco M5D). Vem da Presentation,
 * que traduz o `principal` (crachá ou chave da empresa) para estes primitivos —
 * mantendo o Service livre de conhecer HTTP/RBAC diretamente:
 * - `userId`: quem age (`undefined` = plano máquina/chave da empresa).
 * - `canResumeAny`: pode retomar conversa de QUALQUER um (Manager+/máquina).
 */
export interface ConversationActor {
  userId?: string;
  canResumeAny: boolean;
}

/** Metadados de origem (só auditoria/diagnóstico). */
export interface ConversationActionMeta {
  userAgent?: string;
  ip?: string;
}

/**
 * Application Service que orquestra as operações REST de `conversations`
 * (Milestone 3, Bloco 5) — escalonar/retomar atendimento, listar conversas de
 * um tenant, listar mensagens de uma conversa. Mesmo papel de
 * `WhatsAppSessionService` (Production Hardening, Bloco 5): valida a
 * existência do tenant ANTES de delegar a qualquer repositório, para que o
 * Router (Presentation) nunca precise conhecer `TenantRepository` diretamente
 * (D18 do levantamento arquitetural — roteador fino, sem classe `Controller`
 * separada, delegando direto a este Service).
 *
 * Corrige, para este bounded context, o gap encontrado em D14 do
 * levantamento arquitetural: `WhatsAppSessionService` já valida o tenant
 * antes de agir; este Service faz o mesmo desde o início, em vez de repetir
 * o hiato que deixou `TenantNotFoundError` sem mapeamento HTTP em
 * `whatsAppErrorHandler.ts` por várias milestones.
 */
export class ConversationsService {
  constructor(
    private readonly conversationRepository: ConversationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly auditLogRepository: AuditLogRepository,
    private readonly logger: Logger,
    // Feature N2 (responder pela Dashboard). OPCIONAL para não quebrar as
    // construções existentes (escalate/resume/list não precisam dele); quando
    // ausente, `sendAgentMessage` recusa com erro claro. Em produção é sempre
    // injetado pelo composition root.
    private readonly outboundMessageDispatcher?: OutboundMessageDispatcher,
    // Fase 1, Bloco F1.1 (ADR #90). OPCIONAL, mesmo padrão de
    // `outboundMessageDispatcher`: sem ele configurado, `getMessageMedia`
    // recusa com `MessageMediaNotFoundError` em vez de quebrar. Diferente de
    // `outboundMessageDispatcher` (construído ANTES de `ConversationsService`
    // em `createConversationsComposition`, D15), a implementação real deste
    // port (`WhatsAppMediaDownloader`) só pode ser construída DEPOIS do
    // `WhatsAppConnectionRegistry` existir — e `registry` só existe depois de
    // `conversationsService`, por causa da ordem de composição já documentada
    // em `index.ts` (`conversations` -> `whatsapp`, porque `whatsapp` consome
    // `messageIngestionService` de `conversations`). Por isso `mediaDownloader`
    // também pode ser atribuído depois via `setMediaDownloader` — não dá para
    // resolver essa dependência circular de ORDEM só com parâmetro de
    // construtor, ao contrário de todas as outras dependências desta classe.
    private mediaDownloader?: MediaDownloader,
    // Fase 1, Bloco F1.3. Mesmo padrão/mesmo motivo de `mediaDownloader`
    // (ordem de composição circular: `conversations` é montado antes de
    // `registry` existir) — também injetado tardiamente via setter.
    private mediaSender?: MediaSender,
    // Fase 1, Bloco F1.3 — DIFERENTE de `mediaDownloader`/`mediaSender`: não
    // depende de `registry`/nenhum outro bounded context, então não tem o
    // problema de ordem de composição circular; pode ser um parâmetro de
    // construtor comum, com uma instância própria por padrão (cada teste que
    // não se importa com o cache não precisa fornecer um).
    private readonly agentMediaCache: AgentMediaCache = new AgentMediaCache(),
    // Botão "Salvar contato" do painel de contexto (retrofit visual
    // 2026-08-18). OPCIONAL pelo mesmo motivo de `outboundMessageDispatcher`:
    // testes que não exercitam `saveContactFromConversation` não precisam
    // fornecer um. Em produção é sempre injetado (a mesma instância já usada
    // por `MessageIngestionService`, ver `compositionRoot.ts`).
    private readonly contactResolver?: ContactResolver,
  ) {}

  /**
   * Injeção tardia de `mediaDownloader` (Fase 1, Bloco F1.1, ADR #90) — ver
   * comentário do parâmetro no construtor para o porquê de existir um
   * setter aqui. Chamado uma única vez por `index.ts`, logo após
   * `createWhatsAppSessionsComposition` (que constrói `registry`).
   */
  setMediaDownloader(mediaDownloader: MediaDownloader): void {
    this.mediaDownloader = mediaDownloader;
  }

  /**
   * Injeção tardia de `mediaSender` (Fase 1, Bloco F1.3) — mesmo padrão/mesmo
   * motivo de `setMediaDownloader`, chamado no mesmo lugar de `index.ts`.
   */
  setMediaSender(mediaSender: MediaSender): void {
    this.mediaSender = mediaSender;
  }

  /**
   * `POST .../conversations/:id/messages` — envia uma mensagem do OPERADOR pelo
   * WhatsApp (feature N2). Pré-condições:
   * - a conversa existe e é do tenant (`ConversationNotFoundError`);
   * - está em `'human'` (o operador precisa ter ASSUMIDO antes —
   *   `ConversationNotHumanError`), senão o envio manual competiria com a IA;
   * - ownership: quem não pode agir sobre a de qualquer um (`canResumeAny ===
   *   false`, ex.: Operator) só responde a que ele mesmo assumiu, senão
   *   `ConversationOwnershipError` — mesma regra de `resumeConversation`.
   *
   * Despacha pela MESMA fila outbound da IA (ordem preservada, um único dono do
   * socket — ADR #54), com um `idempotencyKey` gerado (não há `AiInteraction`).
   * A `Message` outbound é persistida pelo `OutboundCommandConsumer` só APÓS o
   * envio ter sucesso — por isso este método devolve `void` (202 na
   * Presentation): o operador vê a mensagem aparecer na timeline via o tempo
   * real (N2-4), não na resposta HTTP.
   */
  async sendAgentMessage(
    tenantId: string,
    conversationId: string,
    content: string,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<void> {
    await this.assertTenantPlanAllowsAgentReply(tenantId);
    if (!this.outboundMessageDispatcher) {
      throw new Error(
        'OutboundMessageDispatcher não configurado para envio de mensagens do operador.',
      );
    }

    const existing = await this.conversationRepository.findById(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new ConversationNotFoundError(conversationId);
    }
    if (existing.status !== 'human') {
      throw new ConversationNotHumanError(conversationId);
    }
    if (
      !actor.canResumeAny &&
      existing.assignedToUserId !== undefined &&
      existing.assignedToUserId !== actor.userId
    ) {
      throw new ConversationOwnershipError(conversationId);
    }

    await this.outboundMessageDispatcher.dispatch({
      tenantId,
      conversationId,
      content: [content],
      idempotencyKey: randomUUID(),
    });
    await this.audit(tenantId, actor.userId, 'conversation.agent_message', conversationId, meta);
  }

  /**
   * `POST .../conversations/:id/media` — envia uma mensagem de MÍDIA do
   * OPERADOR pelo WhatsApp (Fase 1, Bloco F1.3). Mesmas pré-condições de
   * `sendAgentMessage` (conversa existe/é do tenant, está em `'human'`,
   * ownership) — reaproveita exatamente a mesma checagem, só troca o que é
   * despachado ao final.
   *
   * DELIBERADAMENTE SÍNCRONO, sem passar pela fila `whatsapp-outbound` (ADR
   * própria de F1.3, ver DECISIONS.md): o binário já chega em memória (o
   * Router já leu o corpo bruto da requisição antes de chamar este método) e
   * BullMQ/Redis não são feitos para carregar payloads binários grandes.
   * Diferente de `sendAgentMessage`, este método:
   * - chama `MediaSender.send()` diretamente e ESPERA o resultado antes de
   *   retornar — se o WhatsApp recusar o envio (ex.: `WhatsAppNotConnectedError`),
   *   a exceção propaga para o Router, que devolve erro AO OPERADOR na hora
   *   (ele está com a tela aberta esperando, diferente do fluxo assíncrono de
   *   texto/IA);
   * - PERSISTE a `Message` outbound ele mesmo, só APÓS o envio confirmar
   *   sucesso (mesma ordem de segurança do `OutboundCommandConsumer`: nunca
   *   grava um registro de "enviado" antes de confirmar que foi enviado de
   *   verdade) — devolve a `Message` criada (200, não 202: o chamador sabe
   *   na hora se deu certo).
   */
  async sendAgentMediaMessage(
    tenantId: string,
    conversationId: string,
    media: {
      contentType: Exclude<MessageContentType, 'text' | 'sticker'>;
      buffer: Buffer;
      mimeType: string;
      caption?: string;
      fileName?: string;
    },
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Message> {
    await this.assertTenantPlanAllowsAgentReply(tenantId);
    if (!this.mediaSender) {
      throw new Error('MediaSender não configurado para envio de mídia do operador.');
    }
    if (media.buffer.byteLength > MAX_AGENT_MEDIA_UPLOAD_BYTES) {
      throw new AgentMediaTooLargeError(media.buffer.byteLength, MAX_AGENT_MEDIA_UPLOAD_BYTES);
    }
    // Fase 1, Bloco F1.10 — checagem leve de sanidade do Content-Type
    // declarado (ver docstring de `mediaMagicBytes.ts` para os limites
    // deliberados: só rejeita quando o binário tem uma assinatura FORTE de
    // outra categoria; nunca bloqueia por falta de reconhecimento, o que
    // quebraria uploads legítimos de documento).
    if (isDeclaredMediaCategoryImplausible(media.contentType, media.buffer)) {
      const detected = sniffMediaCategory(media.buffer) ?? 'desconhecida';
      throw new AgentMediaTypeMismatchError(media.contentType, detected);
    }

    const existing = await this.conversationRepository.findById(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new ConversationNotFoundError(conversationId);
    }
    if (existing.status !== 'human') {
      throw new ConversationNotHumanError(conversationId);
    }
    if (
      !actor.canResumeAny &&
      existing.assignedToUserId !== undefined &&
      existing.assignedToUserId !== actor.userId
    ) {
      throw new ConversationOwnershipError(conversationId);
    }

    await this.mediaSender.send(tenantId, existing.sessionName, existing.contactJid, media);

    const message = await this.messageRepository.create({
      tenantId,
      conversationId,
      direction: 'outbound',
      content: media.caption ?? '',
      contentType: media.contentType,
      // `url`/`mediaKeyEncrypted` vazios de propósito: mídia enviada pelo
      // OPERADOR nunca teve (nem terá) uma referência ao CDN do WhatsApp —
      // essa referência só existe para mídia RECEBIDA (ADR #90). O binário
      // para reexibição fica só no `agentMediaCache` (ver `getMessageMedia`
      // abaixo), nunca nesta referência persistida.
      media: { mimeType: media.mimeType, url: '', mediaKeyEncrypted: '', fileName: media.fileName },
      occurredAt: new Date(),
    });
    this.agentMediaCache.set(tenantId, message.id, {
      mimeType: media.mimeType,
      fileName: media.fileName,
      data: media.buffer,
    });

    await this.audit(
      tenantId,
      actor.userId,
      'conversation.agent_media_message',
      conversationId,
      meta,
    );
    return message;
  }

  /**
   * `POST .../conversations/:id/escalate` — move a conversa para `status:
   * 'human'` e GRAVA o dono (`assignedToUserId = actor.userId`, Milestone 5
   * M5D/D57: quem assumiu). Registra `conversation.escalated` na auditoria.
   * Idempotente quanto ao status. `actor`/`meta` são opcionais (default plano
   * máquina) para não quebrar chamadores/testes antigos — retrocompatível.
   *
   * Reforma do escalonamento (2026-07-25): este é agora o ÚNICO caminho que
   * tira a IA do circuito — sempre limpa `escalatedAt` junto (`options.
   * escalatedAt: null`), mesmo que a conversa não estivesse sinalizada (é
   * um no-op seguro nesse caso). Antes desta reforma, a IA já colocava a
   * conversa em `'human'` sozinha ao escalar; agora só uma ação humana
   * explícita (este método) faz isso — ver `Conversation.escalatedAt`.
   */
  async escalateConversation(
    tenantId: string,
    conversationId: string,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.updateStatus(
      tenantId,
      conversationId,
      'human',
      {
        assignedToUserId: actor.userId ?? null,
        escalatedAt: null,
      },
    );
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    await this.audit(tenantId, actor.userId, 'conversation.escalated', conversationId, meta);
    return updated;
  }

  /**
   * `POST .../conversations/:id/resume` — devolve a conversa para `status:
   * 'bot'` e LIMPA o dono. Ownership (M5D/D57): quem NÃO pode retomar a de
   * qualquer um (`canResumeAny === false`, ex.: Operator) só retoma a que ele
   * mesmo assumiu — caso contrário `ConversationOwnershipError` (403). Registra
   * `conversation.resumed` na auditoria. Idempotente quanto ao status.
   *
   * Também limpa `escalatedAt` (defensivo — já deveria estar limpo desde que
   * `escalateConversation` o assumiu; garante que devolver ao bot nunca deixa
   * um sinalizador de "aguardando atendente" órfão para trás).
   */
  async resumeConversation(
    tenantId: string,
    conversationId: string,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);

    const existing = await this.conversationRepository.findById(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new ConversationNotFoundError(conversationId);
    }
    if (
      !actor.canResumeAny &&
      existing.assignedToUserId !== undefined &&
      existing.assignedToUserId !== actor.userId
    ) {
      throw new ConversationOwnershipError(conversationId);
    }

    const updated = await this.conversationRepository.updateStatus(
      tenantId,
      conversationId,
      'bot',
      {
        assignedToUserId: null,
        escalatedAt: null,
      },
    );
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    await this.audit(tenantId, actor.userId, 'conversation.resumed', conversationId, meta);
    return updated;
  }

  private async audit(
    tenantId: string,
    actorUserId: string | undefined,
    action: string,
    conversationId: string,
    meta: ConversationActionMeta,
  ): Promise<void> {
    await this.auditLogRepository.record({
      tenantId,
      actorUserId,
      action,
      targetType: 'conversation',
      targetId: conversationId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /**
   * `GET .../conversations/:conversationId` — Fase 1, Bloco F1.10.
   *
   * CONTEXTO: até este bloco não existia um jeito direto de buscar UMA
   * conversa por id — a tela de detalhe (`useConversationDetail`, Dashboard)
   * contornava isso varrendo `listConversations` página a página até achar o
   * id procurado (até 5 páginas de 200 = 1000 linhas, e em DOBRO, porque
   * dois componentes montavam o mesmo hook). Este método é o "achar 1 direto
   * pela chave primária" que faltava.
   *
   * Mesmo padrão de isolamento de tenant já usado por `sendAgentMessage`/
   * `escalateConversation`/etc. nesta classe: `findById` (porta) não filtra
   * por tenant (é uma busca por chave primária pura), então a checagem
   * `existing.tenantId !== tenantId` é OBRIGATÓRIA aqui — sem ela, um
   * usuário autenticado de um tenant poderia ler a conversa de outro só
   * adivinhando/testando um `conversationId` alheio. `ConversationNotFoundError`
   * (→ 404) para os dois casos (não existe / é de outro tenant), nunca 403 —
   * mesmo racional já documentado nos demais métodos: não revela ao
   * cliente HTTP se o id "existe mas não é seu" ou "nunca existiu".
   */
  async getConversation(tenantId: string, conversationId: string): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const existing = await this.conversationRepository.findById(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new ConversationNotFoundError(conversationId);
    }
    return existing;
  }

  /** `GET .../conversations` — lista paginada por cursor (D11). */
  async listConversations(
    tenantId: string,
    options: ListConversationsOptions = {},
  ): Promise<ConversationPage> {
    await this.assertTenantExists(tenantId);
    const limit = Math.min(options.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    return this.conversationRepository.findAllByTenant(tenantId, {
      status: options.status,
      limit,
      cursor: options.cursor,
      sessionName: options.sessionName,
      needsHumanAttention: options.needsHumanAttention,
      awaitingOrInHumanCare: options.awaitingOrInHumanCare,
      excludedFromPipeline: options.excludedFromPipeline,
      archived: options.archived ?? false,
    });
  }

  /**
   * `GET .../conversations/:id/messages` — reaproveita
   * `MessageRepository.listRecentByConversation` (D12: escopo mínimo para
   * este bloco, sem paginação cronológica completa) e inverte a ordem antes
   * de devolver ao cliente HTTP (cronológico, mais antiga primeiro — mesmo
   * precedente já usado em `AiReplyJobProcessor.process()`).
   *
   * Deliberadamente NÃO valida que `conversationId` existe/pertence a
   * `tenantId` antes de consultar: `listRecentByConversation` já filtra por
   * AMBOS (defesa em profundidade, ver docstring do port) — uma conversa
   * inexistente ou de outro tenant simplesmente devolve lista vazia, mesmo
   * comportamento (por design) de `WhatsAppSessionService.getSessionHistory()`
   * para uma sessão já removida.
   */
  async listMessages(tenantId: string, conversationId: string, limit?: number): Promise<Message[]> {
    await this.assertTenantExists(tenantId);
    const effectiveLimit = Math.min(limit ?? DEFAULT_MESSAGES_LIMIT, MAX_MESSAGES_LIMIT);
    const recent = await this.messageRepository.listRecentByConversation(
      tenantId,
      conversationId,
      effectiveLimit,
    );
    return recent.slice().reverse();
  }

  /**
   * `GET .../conversations/:conversationId/messages/:messageId/media` —
   * Fase 1, Bloco F1.1 (ADR #90). Resolve a `Message` (escopada ao tenant),
   * confirma que ela pertence à `conversationId` informada e que é
   * realmente uma mensagem de mídia (`media` presente), resolve o
   * `sessionName` a partir da `Conversation` (mesma sessão de WhatsApp que
   * recebeu a mensagem — necessário para achar a instância viva do
   * provider), e delega o download/decriptação a `MediaDownloader`.
   *
   * Lança `MessageMediaNotFoundError` (→ 404 na Presentation) para TODAS as
   * situações de "não deu para servir esta mídia" — mensagem inexistente,
   * de outra conversa/tenant, sem `media` (é texto), `MediaDownloader` não
   * configurado, ou o download em si falhou (`undefined`, nunca lança) —
   * unificando o tratamento de erro num único caminho, em vez de expor ao
   * cliente HTTP a diferença entre "não existe" e "não consegui baixar
   * agora" (mesmo racional de `ConversationNotFoundError` não diferenciar
   * "não existe" de "é de outro tenant").
   *
   * Fase 1, Bloco F1.3: consulta `agentMediaCache` PRIMEIRO — mídia enviada
   * pelo OPERADOR nunca tem `url`/`mediaKeyEncrypted` reais (só existem para
   * mídia recebida, ver `sendAgentMediaMessage`), então chamar
   * `MediaDownloader` para ela sempre falharia; uma mensagem inbound nunca
   * está no cache (só `sendAgentMediaMessage` grava nele), então essa
   * consulta extra é inerte/rápida para o caso comum (mídia recebida).
   */
  async getMessageMedia(
    tenantId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{ mimeType: string; fileName?: string; data: Buffer }> {
    await this.assertTenantExists(tenantId);

    const message = await this.messageRepository.findById(tenantId, messageId);
    if (!message || message.conversationId !== conversationId || !message.media) {
      throw new MessageMediaNotFoundError(messageId);
    }

    const cached = this.agentMediaCache.get(tenantId, messageId);
    if (cached) {
      return cached;
    }

    const conversation = await this.conversationRepository.findById(conversationId);
    if (!conversation || conversation.tenantId !== tenantId) {
      throw new MessageMediaNotFoundError(messageId);
    }

    if (!this.mediaDownloader) {
      this.logger.warn('Download de mídia pedido sem MediaDownloader configurado', {
        tenantId,
        messageId,
      });
      throw new MessageMediaNotFoundError(messageId);
    }

    const data = await this.mediaDownloader.download(tenantId, conversation.sessionName, {
      contentType: message.contentType as 'image' | 'audio' | 'video' | 'document' | 'sticker',
      mimeType: message.media.mimeType,
      url: message.media.url,
      mediaKeyEncrypted: message.media.mediaKeyEncrypted,
    });
    if (!data) {
      throw new MessageMediaNotFoundError(messageId);
    }

    return { mimeType: message.media.mimeType, fileName: message.media.fileName, data };
  }

  /**
   * `POST .../conversations/:id/read` — indicador de não lidas (2026-07-25):
   * zera `unreadCount` quando um operador abre a conversa pela Dashboard.
   * Sem `ConversationActor`/auditoria (diferente de escalate/resume/
   * sendAgentMessage) — marcar como lida é uma ação de leitura/UX, não uma
   * decisão de negócio que precise ficar na trilha de auditoria (mesmo
   * racional de por que `getSessionStatus`/`listConversations` não auditam).
   * Lança `ConversationNotFoundError` se a conversa não existir/não
   * pertencer ao tenant — mesmo padrão de `escalateConversation`/
   * `resumeConversation`.
   */
  async markAsRead(tenantId: string, conversationId: string): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.markAsRead(tenantId, conversationId);
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    return updated;
  }

  /**
   * Menu "⋮" da conversa (2026-08-29) — marca manualmente como não lida.
   * Sem `ConversationActor`/auditoria (mesmo racional de `markAsRead`: é uma
   * ação de leitura/visualização do dia a dia, não uma mudança de negócio).
   */
  async markAsUnread(tenantId: string, conversationId: string): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.markAsUnread(tenantId, conversationId);
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    return updated;
  }

  /**
   * `POST .../conversations/:id/stage` — pipeline de CRM (Milestone 6, Bloco
   * M6H-5): move a conversa manualmente para um novo estágio (board Kanban,
   * arrastar card entre colunas). SEMPRE grava `stageSetBy: 'human'` — é o
   * ÚNICO caminho de escrita deste campo com esse valor. ATENÇÃO (ADR #89):
   * `stageSetBy: 'human'` é hoje apenas o REGISTRO de quem classificou por
   * último — ele NÃO trava mais a IA. Até a ADR #88 travava: uma correção
   * manual congelava o card para sempre, o que na prática fazia o Pipeline
   * parar de refletir a conversa. Agora a IA reclassifica sempre; a proteção
   * da correção humana passou a ser de DIREÇÃO, não de posse — a IA nunca
   * move um card para trás no funil (ver policy `shouldAiUpdateStage`,
   * checada só do lado da IA em `AiReplyJobProcessor`, nunca aqui: uma ação
   * humana explícita pode mover o card em qualquer direção).
   *
   * Sem `ConversationActor`/ownership (diferente de `escalate`/`resume`):
   * mover um card no board não é uma ação de POSSE do atendimento — qualquer
   * operador com permissão de ver a sessão pode reclassificar o estágio de
   * uma conversa, mesmo que outro tenha assumido o atendimento em si.
   * Registra `conversation.stage_changed` na auditoria (mesmo padrão de
   * `escalate`/`resume` — mudança de estágio é uma decisão de negócio
   * rastreável, diferente de `markAsRead`).
   */
  async updateStage(
    tenantId: string,
    conversationId: string,
    stage: Conversation['stage'],
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.updateStage(
      tenantId,
      conversationId,
      stage,
      'human',
    );
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    await this.audit(tenantId, actor.userId, 'conversation.stage_changed', conversationId, meta);
    return updated;
  }

  /**
   * `POST .../conversations/:id/exclude-from-pipeline` — ADR #94 (2026-08-01,
   * validação Fase 1): marca/desmarca uma conversa como fora do funil
   * comercial (amigo/família/fornecedor/funcionário no mesmo número da
   * empresa). Sempre uma ação humana explícita — mesmo padrão de
   * `updateStage` (auditoria, `actor`/`meta` opcionais). Ao marcar como
   * excluída, a IA para de responder automaticamente na próxima mensagem
   * (`shouldAutoRespond`); o histórico de mensagens já trocadas permanece
   * intacto e acessível.
   */
  async setExcludedFromPipeline(
    tenantId: string,
    conversationId: string,
    excluded: boolean,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.setExcludedFromPipeline(
      tenantId,
      conversationId,
      excluded,
    );
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    await this.audit(
      tenantId,
      actor.userId,
      excluded ? 'conversation.excluded_from_pipeline' : 'conversation.included_in_pipeline',
      conversationId,
      meta,
    );
    return updated;
  }

  /**
   * Menu "⋮" da conversa (2026-08-29) — arquiva/desarquiva (some/reaparece
   * na lista principal de Conversas, sem apagar nada). Mesmo padrão de
   * `setExcludedFromPipeline`: com `ConversationActor`/auditoria, porque é
   * uma decisão operacional explícita, não uma ação de leitura passiva.
   */
  async setArchived(
    tenantId: string,
    conversationId: string,
    archived: boolean,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.setArchived(
      tenantId,
      conversationId,
      archived,
    );
    if (!updated) {
      throw new ConversationNotFoundError(conversationId);
    }
    await this.audit(
      tenantId,
      actor.userId,
      archived ? 'conversation.archived' : 'conversation.unarchived',
      conversationId,
      meta,
    );
    return updated;
  }

  /**
   * Menu "⋮" da conversa (2026-08-29) — exclusão DEFINITIVA. Auditoria
   * ANTES de apagar (senão o registro de auditoria referenciaria uma
   * conversa que já não existe mais mid-operação — ordem deliberada,
   * diferente dos outros métodos, que auditam depois do sucesso).
   */
  async deleteConversation(
    tenantId: string,
    conversationId: string,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<void> {
    await this.assertTenantExists(tenantId);
    await this.audit(tenantId, actor.userId, 'conversation.deleted', conversationId, meta);
    const deleted = await this.conversationRepository.deleteById(tenantId, conversationId);
    if (!deleted) {
      throw new ConversationNotFoundError(conversationId);
    }
  }

  /**
   * `POST .../conversations/:id/save-contact` — botão "Salvar contato" do
   * painel de contexto (retrofit visual 2026-08-18): o operador, olhando uma
   * conversa, salva a pessoa na base de Contatos (Fase L) sem sair da tela.
   * Mesma régua de permissão de `updateStage`/`exclude-from-pipeline`
   * (`message:send`, ação operacional do dia a dia dentro de uma conversa já
   * sendo atendida — não `contact:manage`, reservado a ações que afetam a
   * base do tenant inteiro de uma vez, como importação em lote).
   *
   * Dois casos:
   * - a conversa já tem `contactId` (a maioria — todo `contactJid` com
   *   telefone real já é auto-vinculado na ingestão, ver `ContactResolver`):
   *   este método só GRAVA o nome, se informado.
   * - a conversa ainda não tem `contactId` (raro — falha pontual da
   *   resolução automática): tenta resolver agora e LIGA a conversa a ele
   *   (`linkContact`, idempotente). Se não houver telefone a derivar (`@lid`,
   *   grupo, canal), lança `ConversationContactUnavailableError` — não há
   *   contato nenhum para salvar.
   *
   * `name` vazio/ausente é válido (o contato é criado/vinculado sem nome,
   * mesmo comportamento do resto do produto para um contato "cru").
   */
  async saveContactFromConversation(
    tenantId: string,
    conversationId: string,
    name: string | undefined,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    if (!this.contactResolver) {
      throw new Error('ContactResolver não configurado para salvar contato a partir da conversa.');
    }

    const existing = await this.conversationRepository.findById(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new ConversationNotFoundError(conversationId);
    }

    let contactId = existing.contactId;
    if (!contactId) {
      contactId = await this.contactResolver.resolveByWhatsAppJid(tenantId, existing.contactJid);
      if (!contactId) {
        throw new ConversationContactUnavailableError(conversationId);
      }
      await this.conversationRepository.linkContact(tenantId, conversationId, contactId);
    }

    if (name) {
      await this.contactResolver.saveName(tenantId, contactId, name);
    }

    await this.audit(tenantId, actor.userId, 'conversation.contact_saved', conversationId, meta);

    const updated = await this.conversationRepository.findById(conversationId);
    return updated ?? { ...existing, contactId };
  }

  private async assertTenantExists(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de conversa recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
    return tenant;
  }

  /**
   * Trava de plano (T2, Lançamento suave 2026-08-31): no Plano Grátis a tela
   * de Conversas é só-leitura — o operador não responde pela Dashboard (texto
   * nem mídia). `pro`/`enterprise` respondem normalmente. Fonte única da
   * regra: `planPermiteUso`. Ver `AgentReplyRequiresPaidPlanError`.
   */
  private async assertTenantPlanAllowsAgentReply(tenantId: string): Promise<Tenant> {
    const tenant = await this.assertTenantExists(tenantId);
    if (!planPermiteUso(tenant.plan)) {
      this.logger.warn('Resposta pela Dashboard recusada: Plano Grátis', {
        tenantId,
        plan: tenant.plan,
      });
      throw new AgentReplyRequiresPaidPlanError();
    }
    return tenant;
  }
}
