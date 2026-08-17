import { Campaign, CampaignRecipient, CampaignRecipientSummary } from '../entities/Campaign';
import { RecipientEligibility } from '../policies/determineSkipReason';

/** Dados para criar a campanha (sempre `DRAFT` — este bloco não agenda/inicia envio). */
export interface CreateCampaignData {
  tenantId: string;
  sessionName: string;
  name: string;
  messageTemplate: string;
  createdByUserId?: string;
}

/** Uma linha pronta para inserção em lote — já com o motivo de supressão decidido pelo Domain. */
export interface CampaignRecipientDraft {
  contactId: string;
  status: 'pending' | 'skipped';
  skipReason?: string;
}

/** Paginação por cursor — mesmo padrão de `ContactPage`/`AuditLogPage`. */
export interface ListCampaignsOptions {
  limit: number;
  cursor?: string;
}

export interface CampaignPage {
  campaigns: Campaign[];
  nextCursor?: string;
}

export interface ListCampaignRecipientsOptions {
  limit: number;
  cursor?: string;
  /** Filtra por status — usado pela UI para separar "elegíveis" de "suprimidos" na tela de detalhe. */
  status?: 'pending' | 'sent' | 'failed' | 'skipped' | 'replied';
}

export interface CampaignRecipientPage {
  recipients: CampaignRecipient[];
  nextCursor?: string;
}

/**
 * Porta (port) de persistência de campanhas — Fase L, Bloco L3.
 *
 * `fetchEligibility` é o único método que olha PARA FORA do próprio bounded
 * context (`whatsapp_contacts`/`whatsapp_conversations`/`campaign_recipients`
 * de outras campanhas) — mesmo racional já usado por `PrismaAnalyticsRepository`
 * (M6H-4/F1.6): é uma consulta de LEITURA que cruza tabelas para produzir um
 * relatório, não uma dependência de escrita entre domínios. Um port dedicado
 * (`ContactResolver`-style) seria mais "puro", mas replicaria a mesma
 * consulta em três interfaces estreitas só para evitar um JOIN — YAGNI dado
 * que nenhum outro contexto precisa desta leitura.
 */
export interface CampaignRepository {
  create(data: CreateCampaignData): Promise<Campaign>;

  findById(tenantId: string, campaignId: string): Promise<Campaign | undefined>;

  listByTenant(tenantId: string, options: ListCampaignsOptions): Promise<CampaignPage>;

  /**
   * Para cada `contactId` informado, resolve a elegibilidade (opt-out,
   * conversa ativa com humano, contato recente por outra campanha) — ver
   * `RecipientEligibility`. Contatos que não existem/não pertencem ao tenant
   * simplesmente não aparecem no mapa devolvido (o chamador decide o que
   * fazer com um id desconhecido).
   */
  fetchEligibility(
    tenantId: string,
    contactIds: string[],
  ): Promise<Map<string, RecipientEligibility>>;

  /**
   * Insere os destinatários calculados em lote. `skipDuplicates: true`
   * (apoiado no `@@unique([campaignId, contactId])`) torna uma segunda
   * chamada para a MESMA campanha um no-op para quem já existe — a
   * materialização nunca duplica.
   */
  createRecipients(
    tenantId: string,
    campaignId: string,
    recipients: CampaignRecipientDraft[],
  ): Promise<void>;

  /** Contagens por status/motivo — o "63 de 100, eis os motivos" da tela de detalhe. */
  summarizeRecipients(tenantId: string, campaignId: string): Promise<CampaignRecipientSummary>;

  listRecipients(
    tenantId: string,
    campaignId: string,
    options: ListCampaignRecipientsOptions,
  ): Promise<CampaignRecipientPage>;
}
