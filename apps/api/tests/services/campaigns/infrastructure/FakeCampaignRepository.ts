import {
  Campaign,
  CampaignRecipient,
  CampaignRecipientSummary,
  CampaignSkipReason,
} from '../../../../src/services/campaigns/domain/entities/Campaign';
import { RecipientEligibility } from '../../../../src/services/campaigns/domain/policies/determineSkipReason';
import {
  CampaignPage,
  CampaignRecipientDraft,
  CampaignRecipientPage,
  CampaignRepository,
  CreateCampaignData,
  ListCampaignRecipientsOptions,
  ListCampaignsOptions,
} from '../../../../src/services/campaigns/domain/repositories/CampaignRepository';

const FIXED_NOW = new Date('2026-08-17T00:00:00.000Z');

/**
 * Fake em memória de `CampaignRepository` — Fase L, Bloco L3. Mesmo papel
 * dos demais Fakes deste projeto: determinístico, sem banco.
 *
 * `fetchEligibility` é configurável via `seedEligibility` — o Fake não
 * recalcula opt-out/conversa/recontato sozinho (isso é responsabilidade da
 * Infrastructure REAL, coberta por teste de integração próprio); aqui só
 * devolve o que o teste pré-carregou, para exercitar o `CampaignService`
 * isoladamente.
 */
export class FakeCampaignRepository implements CampaignRepository {
  private readonly campaigns = new Map<string, Campaign>();
  private readonly recipients = new Map<string, CampaignRecipient>();
  private readonly eligibility = new Map<string, RecipientEligibility>();
  private nextCampaignId = 1;
  private nextRecipientId = 1;

  async create(data: CreateCampaignData): Promise<Campaign> {
    const id = `campaign-${this.nextCampaignId++}`;
    const campaign: Campaign = {
      id,
      tenantId: data.tenantId,
      sessionName: data.sessionName,
      name: data.name,
      messageTemplate: data.messageTemplate,
      status: 'draft',
      intervalSeconds: 75,
      dailyLimit: 30,
      createdByUserId: data.createdByUserId,
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    };
    this.campaigns.set(id, campaign);
    return campaign;
  }

  async findById(tenantId: string, campaignId: string): Promise<Campaign | undefined> {
    const row = this.campaigns.get(campaignId);
    return row && row.tenantId === tenantId ? row : undefined;
  }

  async listByTenant(tenantId: string, options: ListCampaignsOptions): Promise<CampaignPage> {
    const all = [...this.campaigns.values()]
      .filter((row) => row.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const startIndex = options.cursor ? all.findIndex((row) => row.id === options.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + options.limit);
    const nextCursor =
      startIndex + options.limit < all.length ? page[page.length - 1]?.id : undefined;
    return { campaigns: page, nextCursor };
  }

  async fetchEligibility(
    _tenantId: string,
    contactIds: string[],
  ): Promise<Map<string, RecipientEligibility>> {
    const result = new Map<string, RecipientEligibility>();
    for (const contactId of contactIds) {
      const eligibility = this.eligibility.get(contactId);
      if (eligibility) {
        result.set(contactId, eligibility);
      }
    }
    return result;
  }

  async createRecipients(
    tenantId: string,
    campaignId: string,
    recipients: CampaignRecipientDraft[],
  ): Promise<void> {
    for (const draft of recipients) {
      const existing = [...this.recipients.values()].find(
        (row) => row.campaignId === campaignId && row.contactId === draft.contactId,
      );
      if (existing) continue; // skipDuplicates
      const id = `recipient-${this.nextRecipientId++}`;
      this.recipients.set(id, {
        id,
        tenantId,
        campaignId,
        contactId: draft.contactId,
        status: draft.status,
        skipReason: draft.skipReason,
        createdAt: FIXED_NOW,
      });
    }
  }

  async summarizeRecipients(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignRecipientSummary> {
    const rows = [...this.recipients.values()].filter(
      (row) => row.tenantId === tenantId && row.campaignId === campaignId,
    );
    const skipReasons: Partial<Record<CampaignSkipReason, number>> = {};
    let pending = 0;
    let skipped = 0;
    for (const row of rows) {
      if (row.status === 'pending') pending += 1;
      if (row.status === 'skipped') {
        skipped += 1;
        if (row.skipReason) {
          const reason = row.skipReason as CampaignSkipReason;
          skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
        }
      }
    }
    return { total: rows.length, pending, skipped, skipReasons };
  }

  async listRecipients(
    tenantId: string,
    campaignId: string,
    options: ListCampaignRecipientsOptions,
  ): Promise<CampaignRecipientPage> {
    let all = [...this.recipients.values()].filter(
      (row) => row.tenantId === tenantId && row.campaignId === campaignId,
    );
    if (options.status) {
      all = all.filter((row) => row.status === options.status);
    }
    all = all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const startIndex = options.cursor ? all.findIndex((row) => row.id === options.cursor) + 1 : 0;
    const page = all.slice(startIndex, startIndex + options.limit);
    const nextCursor =
      startIndex + options.limit < all.length ? page[page.length - 1]?.id : undefined;
    return { recipients: page, nextCursor };
  }

  /** Helper de teste: define a elegibilidade que `fetchEligibility` devolverá para um contato. */
  seedEligibility(contactId: string, eligibility: RecipientEligibility): void {
    this.eligibility.set(contactId, eligibility);
  }
}
