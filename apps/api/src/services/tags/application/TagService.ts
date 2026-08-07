import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { Tag, TagColor } from '../domain/entities/Tag';
import { TagRepository, TagInput } from '../domain/repositories/TagRepository';
import { TagNotFoundError } from '../domain/errors/TagNotFoundError';

/** Teto de tamanho do nome de uma tag — validado também na Presentation (zod); aqui só para a constante ficar num lugar só, mesmo padrão de `MAX_QUICK_REPLY_CONTENT_LENGTH`. */
export const MAX_TAG_NAME_LENGTH = 40;

/**
 * Application Service das tags (Redesign 2026-08-05, R4). Orquestra CRUD do
 * catálogo (escopado por `(tenantId, sessionName)`) e atribuição a
 * conversas. Deliberadamente NÃO valida que `sessionName` existe como
 * `WhatsAppSession` de fato (mesmo princípio de baixo acoplamento entre
 * bounded contexts já seguido por `AiBusinessProfileService`/`QuickReplyService`).
 *
 * Valida a existência do TENANT antes de qualquer operação (mesmo padrão
 * dos demais Services deste projeto).
 */
export class TagService {
  constructor(
    private readonly tagRepository: TagRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async listTags(tenantId: string, sessionName: string): Promise<Tag[]> {
    await this.assertTenantExists(tenantId);
    return this.tagRepository.listBySession(tenantId, sessionName);
  }

  async createTag(
    tenantId: string,
    sessionName: string,
    name: string,
    color: TagColor,
  ): Promise<Tag> {
    await this.assertTenantExists(tenantId);
    return this.tagRepository.create(tenantId, sessionName, name, color);
  }

  /** @throws TagNotFoundError se `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  async updateTag(tenantId: string, sessionName: string, id: string, data: TagInput): Promise<Tag> {
    await this.assertTenantExists(tenantId);
    const updated = await this.tagRepository.update(tenantId, sessionName, id, data);
    if (!updated) {
      throw new TagNotFoundError(id);
    }
    return updated;
  }

  /** @throws TagNotFoundError se `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  async removeTag(tenantId: string, sessionName: string, id: string): Promise<void> {
    await this.assertTenantExists(tenantId);
    const removed = await this.tagRepository.remove(tenantId, sessionName, id);
    if (!removed) {
      throw new TagNotFoundError(id);
    }
  }

  /**
   * Atribui uma tag a uma conversa. @throws TagNotFoundError quando a
   * conversa não pertence ao tenant, OU a tag não existe/não é da MESMA
   * sessão da conversa — as duas situações colapsam no mesmo erro
   * genérico (mesmo racional de segurança já usado em
   * `ConversationRepository.updateStatus`: nunca revelar detalhe de um
   * recurso de outro tenant a um chamador não autorizado).
   */
  async assignTag(tenantId: string, conversationId: string, tagId: string): Promise<void> {
    await this.assertTenantExists(tenantId);
    const ok = await this.tagRepository.assign(tenantId, conversationId, tagId);
    if (!ok) {
      throw new TagNotFoundError(tagId);
    }
  }

  /** @throws TagNotFoundError quando a conversa não pertence ao tenant. Remover uma atribuição inexistente não é erro (idempotente). */
  async unassignTag(tenantId: string, conversationId: string, tagId: string): Promise<void> {
    await this.assertTenantExists(tenantId);
    const ok = await this.tagRepository.unassign(tenantId, conversationId, tagId);
    if (!ok) {
      throw new TagNotFoundError(tagId);
    }
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de tag recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
