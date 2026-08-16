import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { Contact } from '../domain/entities/Contact';
import { ContactNotFoundError } from '../domain/errors/ContactNotFoundError';
import { ContactRepository } from '../domain/repositories/ContactRepository';
import { ConsentEventRepository } from '../domain/repositories/ConsentEventRepository';

/**
 * Application Service de consentimento — Fase L, Bloco L2.
 *
 * Orquestra as DUAS escritas de um opt-out/opt-in: o estado atual
 * (`WhatsAppContact.optOutAt`, para consulta rápida — "esta pessoa pode
 * receber campanha?") e o log append-only (`ContactConsentEvent`, para
 * auditoria — "quando e por que"). As duas chamadas são sequenciais, sem
 * transação Prisma — mesmo risco já aceito neste projeto para `AuditLog`
 * (`ConversationsService.audit()`, chamado depois da ação principal, sem
 * garantia atômica): o log é auxiliar, uma falha nele não deveria desfazer
 * a mudança de estado que já aconteceu.
 *
 * NÃO decide QUANDO opt-out acontece — isso é responsabilidade de quem
 * chama: `MessageIngestionService` (automático, por palavra-chave) ou o
 * router (manual, por um administrator/owner). Este Service só garante que,
 * seja qual for o gatilho, as duas escritas ficam consistentes e no mesmo
 * lugar — sem duplicar a lógica de "gravar estado + logar evento" em dois
 * pontos do código.
 */
export class ContactConsentService {
  constructor(
    private readonly contactRepository: ContactRepository,
    private readonly consentEventRepository: ConsentEventRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  /**
   * Marca opt-out. IDEMPOTENTE no estado (reescrever `optOutAt` de quem já
   * está de fora não muda o resultado do lado de fora), mas SEMPRE grava um
   * novo `ConsentEvent` — uma pessoa que já pediu para sair e pede de novo
   * não deveria "sumir" da linha do tempo de auditoria.
   *
   * `actorUserId` ausente = automático (palavra-chave); presente = ação
   * manual de um humano.
   */
  async recordOptOut(
    tenantId: string,
    contactId: string,
    reason: string,
    actorUserId?: string,
  ): Promise<Contact> {
    await this.assertTenantExists(tenantId);
    const contact = await this.contactRepository.setOptOutAt(tenantId, contactId, new Date());
    if (!contact) {
      throw new ContactNotFoundError(contactId);
    }
    await this.consentEventRepository.record({
      tenantId,
      contactId,
      type: 'opt_out',
      reason,
      actorUserId,
    });
    this.logger.info('Contato marcado como opt-out', { tenantId, contactId, reason, actorUserId });
    return contact;
  }

  /**
   * Reverte um opt-out — sempre ação MANUAL (não existe opt-in automático por
   * palavra-chave). `actorUserId` opcional pelo mesmo motivo de
   * `ConversationActor` em `services/conversations`: o plano MÁQUINA (chave
   * do tenant) também pode chamar esta ação, só fica sem ator humano
   * identificado no log.
   */
  async recordOptIn(tenantId: string, contactId: string, actorUserId?: string): Promise<Contact> {
    await this.assertTenantExists(tenantId);
    const contact = await this.contactRepository.setOptOutAt(tenantId, contactId, null);
    if (!contact) {
      throw new ContactNotFoundError(contactId);
    }
    await this.consentEventRepository.record({
      tenantId,
      contactId,
      type: 'opt_in',
      reason: 'manual',
      actorUserId,
    });
    this.logger.info('Contato revertido de opt-out (opt-in manual)', {
      tenantId,
      contactId,
      actorUserId,
    });
    return contact;
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de consentimento recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
