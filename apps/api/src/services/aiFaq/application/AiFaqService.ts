import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AiFaqEntry } from '../domain/entities/AiFaqEntry';
import { AiFaqEntryUpdateInput, AiFaqRepository } from '../domain/repositories/AiFaqRepository';
import { AiFaqEntryNotFoundError } from '../domain/errors/AiFaqEntryNotFoundError';

/**
 * Teto de tamanho da pergunta/resposta — bem menor que
 * `MAX_PROFILE_CONTENT_LENGTH` (20.000, texto livre do "Conhecimento"): uma
 * FAQ é um par curto e objetivo, não um documento.
 */
export const MAX_FAQ_QUESTION_LENGTH = 300;
export const MAX_FAQ_ANSWER_LENGTH = 2000;
export const MAX_FAQ_CATEGORY_LENGTH = 60;

/**
 * Application Service da FAQ estruturada (Cérebro da IA v3, Fase 2).
 * Orquestra CRUD sobre `AiFaqRepository`, escopado por `(tenantId,
 * sessionName)`. Mesmo racional de baixo acoplamento de
 * `AiBusinessProfileService`/`QuickReplyService`: não valida que
 * `sessionName` existe como `WhatsAppSession` de fato.
 */
export class AiFaqService {
  constructor(
    private readonly aiFaqRepository: AiFaqRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async listFaqEntries(tenantId: string, sessionName: string): Promise<AiFaqEntry[]> {
    await this.assertTenantExists(tenantId);
    return this.aiFaqRepository.listBySession(tenantId, sessionName);
  }

  /** Usado pela injeção no prompt (`buildFaqContext`) — só entradas ativas. */
  async listActiveFaqEntries(tenantId: string, sessionName: string): Promise<AiFaqEntry[]> {
    return this.aiFaqRepository.listActiveBySession(tenantId, sessionName);
  }

  async createFaqEntry(
    tenantId: string,
    sessionName: string,
    question: string,
    answer: string,
    category: string | null,
  ): Promise<AiFaqEntry> {
    await this.assertTenantExists(tenantId);
    return this.aiFaqRepository.create(tenantId, sessionName, question, answer, category);
  }

  /** @throws AiFaqEntryNotFoundError se `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  async updateFaqEntry(
    tenantId: string,
    sessionName: string,
    id: string,
    input: AiFaqEntryUpdateInput,
  ): Promise<AiFaqEntry> {
    await this.assertTenantExists(tenantId);
    const updated = await this.aiFaqRepository.update(tenantId, sessionName, id, input);
    if (!updated) {
      throw new AiFaqEntryNotFoundError(id);
    }
    return updated;
  }

  /** @throws AiFaqEntryNotFoundError se `id` não existir ou não pertencer a `(tenantId, sessionName)`. */
  async removeFaqEntry(tenantId: string, sessionName: string, id: string): Promise<void> {
    await this.assertTenantExists(tenantId);
    const removed = await this.aiFaqRepository.remove(tenantId, sessionName, id);
    if (!removed) {
      throw new AiFaqEntryNotFoundError(id);
    }
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de FAQ da IA recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
