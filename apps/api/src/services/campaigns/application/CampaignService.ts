import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { Campaign, CampaignRecipientSummary } from '../domain/entities/Campaign';
import { CampaignNotFoundError } from '../domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../domain/errors/NoRecipientsSelectedError';
import { determineSkipReason } from '../domain/policies/determineSkipReason';
import {
  CampaignPage,
  CampaignRecipientDraft,
  CampaignRecipientPage,
  CampaignRepository,
  ListCampaignRecipientsOptions,
  ListCampaignsOptions,
} from '../domain/repositories/CampaignRepository';

export interface CreateCampaignInput {
  tenantId: string;
  sessionName: string;
  name: string;
  messageTemplate: string;
  contactIds: string[];
  createdByUserId?: string;
}

export interface CreateCampaignResult {
  campaign: Campaign;
  summary: CampaignRecipientSummary;
}

/**
 * Orquestra a criação de uma campanha e o cálculo (materialização) dos
 * destinatários — Fase L, Bloco L3.
 *
 * **Este serviço NUNCA envia nenhuma mensagem.** Ele só decide, para cada
 * contato selecionado, se entra (`pending`) ou é suprimido (`skipped` + um
 * motivo) — a mesma régua de três regras confirmada com o fundador (ver
 * docstring de `determineSkipReason`). O envio real é trabalho do L4/L5
 * (fila `campaign-send` + disjuntor de segurança), ainda não implementado.
 */
export class CampaignService {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  async createCampaign(input: CreateCampaignInput): Promise<CreateCampaignResult> {
    await this.assertTenantExists(input.tenantId);

    // Dedup defensivo: a UI já evita ids repetidos (é um `Set` de seleção),
    // mas um cliente HTTP direto poderia mandar a mesma lista duas vezes —
    // sem isso, `createRecipients` colidiria consigo mesma no lote.
    const contactIds = Array.from(new Set(input.contactIds));
    if (contactIds.length === 0) {
      throw new NoRecipientsSelectedError();
    }

    const campaign = await this.campaignRepository.create({
      tenantId: input.tenantId,
      sessionName: input.sessionName,
      name: input.name,
      messageTemplate: input.messageTemplate,
      createdByUserId: input.createdByUserId,
    });

    const eligibilityByContactId = await this.campaignRepository.fetchEligibility(
      input.tenantId,
      contactIds,
    );

    const drafts: CampaignRecipientDraft[] = contactIds
      // Um `contactId` que não existe mais/não pertence ao tenant simplesmente
      // não aparece no mapa de elegibilidade — ignorado aqui, nunca vira uma
      // linha "fantasma" de destinatário.
      .filter((contactId) => eligibilityByContactId.has(contactId))
      .map((contactId) => {
        const eligibility = eligibilityByContactId.get(contactId)!;
        const skipReason = determineSkipReason(eligibility);
        return skipReason
          ? { contactId, status: 'skipped' as const, skipReason }
          : { contactId, status: 'pending' as const };
      });

    await this.campaignRepository.createRecipients(input.tenantId, campaign.id, drafts);

    const summary = await this.campaignRepository.summarizeRecipients(input.tenantId, campaign.id);

    this.logger.info('Campanha criada e destinatários calculados', {
      tenantId: input.tenantId,
      campaignId: campaign.id,
      sessionName: input.sessionName,
      total: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
    });

    return { campaign, summary };
  }

  async listCampaigns(tenantId: string, options: ListCampaignsOptions): Promise<CampaignPage> {
    await this.assertTenantExists(tenantId);
    return this.campaignRepository.listByTenant(tenantId, options);
  }

  async getCampaign(
    tenantId: string,
    campaignId: string,
  ): Promise<{ campaign: Campaign; summary: CampaignRecipientSummary }> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    const summary = await this.campaignRepository.summarizeRecipients(tenantId, campaignId);
    return { campaign, summary };
  }

  async listRecipients(
    tenantId: string,
    campaignId: string,
    options: ListCampaignRecipientsOptions,
  ): Promise<CampaignRecipientPage> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    return this.campaignRepository.listRecipients(tenantId, campaignId, options);
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de campanha recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
