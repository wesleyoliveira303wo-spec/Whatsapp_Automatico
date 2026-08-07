import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { QuickReply } from '../domain/entities/QuickReply';
import { QuickReplyRepository } from '../domain/repositories/QuickReplyRepository';
import { QuickReplyNotFoundError } from '../domain/errors/QuickReplyNotFoundError';

/**
 * Teto de tamanho do texto de uma resposta rápida — mesmo limite de mensagem
 * de texto do WhatsApp já usado pelo `MessageComposer` (`MAX_LENGTH` em
 * `apps/dashboard/components/MessageComposer.tsx`): uma resposta rápida
 * nada mais é do que texto pré-digitado que vai para o mesmo campo. Validado
 * na Presentation (zod), com a constante exportada para o router referenciar
 * — mesmo padrão de `MAX_PROFILE_CONTENT_LENGTH` (`AiBusinessProfileService`).
 */
export const MAX_QUICK_REPLY_CONTENT_LENGTH = 4096;

/**
 * Application Service das respostas rápidas (Fase 1, Bloco F1.9). Orquestra
 * CRUD sobre `QuickReplyRepository`, escopado por `(tenantId, sessionName)`.
 * Deliberadamente NÃO valida que `sessionName` existe como `WhatsAppSession`
 * de fato (mesmo princípio de baixo acoplamento entre bounded contexts já
 * seguido por `AiBusinessProfileService`) — um `sessionName` inexistente
 * simplesmente nunca aparece na UI daquela sessão, não é um estado nocivo.
 *
 * Valida a existência do TENANT antes de qualquer operação (mesmo padrão de
 * `AiBusinessProfileService.assertTenantExists`).
 */
export class QuickReplyService {
  constructor(
    private readonly quickReplyRepository: QuickReplyRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async listQuickReplies(tenantId: string, sessionName: string): Promise<QuickReply[]> {
    await this.assertTenantExists(tenantId);
    return this.quickReplyRepository.listBySession(tenantId, sessionName);
  }

  async createQuickReply(
    tenantId: string,
    sessionName: string,
    content: string,
  ): Promise<QuickReply> {
    await this.assertTenantExists(tenantId);
    return this.quickReplyRepository.create(tenantId, sessionName, content);
  }

  /** @throws QuickReplyNotFoundError se `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  async updateQuickReply(
    tenantId: string,
    sessionName: string,
    id: string,
    content: string,
  ): Promise<QuickReply> {
    await this.assertTenantExists(tenantId);
    const updated = await this.quickReplyRepository.update(tenantId, sessionName, id, content);
    if (!updated) {
      throw new QuickReplyNotFoundError(id);
    }
    return updated;
  }

  /** @throws QuickReplyNotFoundError se `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  async removeQuickReply(tenantId: string, sessionName: string, id: string): Promise<void> {
    await this.assertTenantExists(tenantId);
    const removed = await this.quickReplyRepository.remove(tenantId, sessionName, id);
    if (!removed) {
      throw new QuickReplyNotFoundError(id);
    }
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de quick-reply recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
