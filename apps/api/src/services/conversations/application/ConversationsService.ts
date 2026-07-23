import { randomUUID } from 'crypto';

import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import { OutboundMessageDispatcher } from '../../whatsapp/domain/dispatchers/OutboundMessageDispatcher';
import { Conversation } from '../domain/entities/Conversation';
import { Message } from '../domain/entities/Message';
import { ConversationRepository, ConversationPage } from '../domain/repositories/ConversationRepository';
import { MessageRepository } from '../domain/repositories/MessageRepository';
import { ConversationNotFoundError } from '../domain/errors/ConversationNotFoundError';
import { ConversationOwnershipError } from '../domain/errors/ConversationOwnershipError';
import { ConversationNotHumanError } from '../domain/errors/ConversationNotHumanError';

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
  ) {}

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
    await this.assertTenantExists(tenantId);
    if (!this.outboundMessageDispatcher) {
      throw new Error('OutboundMessageDispatcher não configurado para envio de mensagens do operador.');
    }

    const existing = await this.conversationRepository.findById(conversationId);
    if (!existing || existing.tenantId !== tenantId) {
      throw new ConversationNotFoundError(conversationId);
    }
    if (existing.status !== 'human') {
      throw new ConversationNotHumanError(conversationId);
    }
    if (!actor.canResumeAny && existing.assignedToUserId !== undefined && existing.assignedToUserId !== actor.userId) {
      throw new ConversationOwnershipError(conversationId);
    }

    await this.outboundMessageDispatcher.dispatch({ tenantId, conversationId, content, idempotencyKey: randomUUID() });
    await this.audit(tenantId, actor.userId, 'conversation.agent_message', conversationId, meta);
  }

  /**
   * `POST .../conversations/:id/escalate` — move a conversa para `status:
   * 'human'` e GRAVA o dono (`assignedToUserId = actor.userId`, Milestone 5
   * M5D/D57: quem assumiu). Registra `conversation.escalated` na auditoria.
   * Idempotente quanto ao status. `actor`/`meta` são opcionais (default plano
   * máquina) para não quebrar chamadores/testes antigos — retrocompatível.
   */
  async escalateConversation(
    tenantId: string,
    conversationId: string,
    actor: ConversationActor = { canResumeAny: true },
    meta: ConversationActionMeta = {},
  ): Promise<Conversation> {
    await this.assertTenantExists(tenantId);
    const updated = await this.conversationRepository.updateStatus(tenantId, conversationId, 'human', {
      assignedToUserId: actor.userId ?? null,
    });
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
    if (!actor.canResumeAny && existing.assignedToUserId !== undefined && existing.assignedToUserId !== actor.userId) {
      throw new ConversationOwnershipError(conversationId);
    }

    const updated = await this.conversationRepository.updateStatus(tenantId, conversationId, 'bot', { assignedToUserId: null });
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

  /** `GET .../conversations` — lista paginada por cursor (D11). */
  async listConversations(tenantId: string, options: ListConversationsOptions = {}): Promise<ConversationPage> {
    await this.assertTenantExists(tenantId);
    const limit = Math.min(options.limit ?? DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT);
    return this.conversationRepository.findAllByTenant(tenantId, {
      status: options.status,
      limit,
      cursor: options.cursor,
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
    const recent = await this.messageRepository.listRecentByConversation(tenantId, conversationId, effectiveLimit);
    return recent.slice().reverse();
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de conversa recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
