import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { Campaign, CampaignRecipientSummary } from '../domain/entities/Campaign';
import { CampaignNotFoundError } from '../domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../domain/errors/NoRecipientsSelectedError';
import { InvalidCampaignTransitionError } from '../domain/errors/InvalidCampaignTransitionError';
import { SendingEngineNotConfiguredError } from '../domain/errors/SendingEngineNotConfiguredError';
import { determineSkipReason } from '../domain/policies/determineSkipReason';
import { computeSendDelayMs } from '../domain/policies/computeSendDelayMs';
import { CampaignSendDispatcher } from '../domain/dispatchers/CampaignSendDispatcher';
import {
  CampaignPage,
  CampaignRecipientDraft,
  CampaignRecipientPage,
  CampaignRepository,
  ListCampaignRecipientsOptions,
  ListCampaignsOptions,
} from '../domain/repositories/CampaignRepository';

/** Variação aleatória somada ao intervalo-base de cada envio (ver `computeSendDelayMs`) — mesmo espírito conservador do resto do motor de ritmo. */
const DEFAULT_JITTER_MAX_MS = 15_000;

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
    /**
     * Fase L, Bloco L4 — OPCIONAL (mesmo padrão de `mediaSender` em
     * `ConversationsService`): ausente no modo degradado (sem `REDIS_URL`),
     * onde `campaignsRouter` continua montado para leitura/criação, mas o
     * motor de envio não existe. `startCampaign()` recusa com um erro claro
     * (`SendingEngineNotConfiguredError`) em vez de quebrar.
     */
    private campaignSendDispatcher?: CampaignSendDispatcher,
  ) {}

  /** Injeção tardia (Fase L, Bloco L4) — mesmo motivo/mesmo padrão de `ConversationsService.setMediaSender`: só existe depois que `WhatsAppConnectionRegistry` é montado, numa etapa posterior da composição em `index.ts`. */
  setCampaignSendDispatcher(dispatcher: CampaignSendDispatcher): void {
    this.campaignSendDispatcher = dispatcher;
  }

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

  /**
   * Inicia (ou RETOMA, após pausa) uma campanha — Fase L, Bloco L4. Só
   * `draft`/`paused` podem virar `running`; qualquer outro status lança
   * `InvalidCampaignTransitionError`.
   *
   * Reagenda TODOS os destinatários ainda `PENDING` (não só os nunca
   * tentados) com um delay FRESCO, calculado a partir de AGORA — nunca do
   * `n` original de quando a campanha nasceu. É isto que torna retomar uma
   * campanha pausada seguro sem lógica extra: um job cujo horário chegou
   * enquanto a campanha estava pausada já rodou, viu `status !== 'running'`
   * e terminou sem enviar (removendo o `jobId`, ver `CampaignSendJobProcessor`)
   * — o destinatário ficou `PENDING`, órfão de qualquer job futuro, até este
   * método rodar de novo e reagendá-lo.
   */
  async startCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    if (!this.campaignSendDispatcher) {
      throw new SendingEngineNotConfiguredError();
    }

    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new InvalidCampaignTransitionError(campaign.status, 'start');
    }

    const pendingRecipients = await this.campaignRepository.listPendingRecipients(
      tenantId,
      campaignId,
    );

    if (pendingRecipients.length === 0) {
      // Nada para enviar (ex.: todos suprimidos na materialização) — a
      // campanha nunca chega a `running`, vai direto para `completed`.
      const completed = await this.campaignRepository.updateCampaignStatus(
        tenantId,
        campaignId,
        'completed',
      );
      return completed!;
    }

    const now = new Date();
    await Promise.all(
      pendingRecipients.map((recipient, index) => {
        const delayMs = computeSendDelayMs(index, {
          intervalBaseMs: campaign.intervalSeconds * 1000,
          jitterMaxMs: DEFAULT_JITTER_MAX_MS,
          sendWindowStart: campaign.sendWindowStart,
          sendWindowEnd: campaign.sendWindowEnd,
          now,
        });
        return this.campaignSendDispatcher!.scheduleRecipient(
          tenantId,
          campaignId,
          recipient.id,
          delayMs,
        );
      }),
    );

    const updated = await this.campaignRepository.updateCampaignStatus(
      tenantId,
      campaignId,
      'running',
    );
    this.logger.info('Campanha iniciada/retomada', {
      tenantId,
      campaignId,
      recipientsScheduled: pendingRecipients.length,
    });
    return updated!;
  }

  /**
   * Pausa uma campanha em execução — Fase L, Bloco L4. Não toca a fila (ver
   * docstring de `CampaignSendDispatcher`): jobs já agendados disparam
   * normalmente no horário, olham `status`, e não fazem nada.
   */
  async pauseCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status !== 'running') {
      throw new InvalidCampaignTransitionError(campaign.status, 'pause');
    }
    const updated = await this.campaignRepository.updateCampaignStatus(
      tenantId,
      campaignId,
      'paused',
      'paused_manually',
    );
    this.logger.info('Campanha pausada manualmente', { tenantId, campaignId });
    return updated!;
  }

  /**
   * Cancela uma campanha (terminal — não pode ser retomada). Permitido a
   * partir de qualquer status ainda não terminal (`draft`/`running`/`paused`).
   */
  async cancelCampaign(tenantId: string, campaignId: string): Promise<Campaign> {
    await this.assertTenantExists(tenantId);
    const campaign = await this.campaignRepository.findById(tenantId, campaignId);
    if (!campaign) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new InvalidCampaignTransitionError(campaign.status, 'cancel');
    }
    const updated = await this.campaignRepository.updateCampaignStatus(
      tenantId,
      campaignId,
      'cancelled',
    );
    this.logger.info('Campanha cancelada', { tenantId, campaignId });
    return updated!;
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Operação de campanha recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }
}
