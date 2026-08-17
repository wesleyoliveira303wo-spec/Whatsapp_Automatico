import type {
  PrismaClient,
  CampaignRecipientStatus as PrismaCampaignRecipientStatus,
} from '@prisma/client';

import {
  Campaign,
  CampaignRecipient,
  CampaignRecipientStatus,
  CampaignRecipientSummary,
  CampaignSkipReason,
  CampaignStatus,
} from '../../domain/entities/Campaign';
import {
  CampaignPage,
  CampaignRecipientDraft,
  CampaignRecipientPage,
  CampaignRepository,
  CreateCampaignData,
  ListCampaignRecipientsOptions,
  ListCampaignsOptions,
} from '../../domain/repositories/CampaignRepository';
import { RecipientEligibility } from '../../domain/policies/determineSkipReason';

/** Janela de "contatado recentemente por outra campanha" — mesmo valor citado na análise aprovada (`FASE_L_MOTOR_DE_LEADS.md`). */
const RECENT_CONTACT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_FROM_PRISMA: Record<string, CampaignStatus> = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const RECIPIENT_STATUS_TO_PRISMA: Record<
  CampaignRecipientDraft['status'],
  PrismaCampaignRecipientStatus
> = {
  pending: 'PENDING',
  skipped: 'SKIPPED',
};

const RECIPIENT_STATUS_FROM_PRISMA: Record<string, CampaignRecipientStatus> = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  REPLIED: 'replied',
};

interface CampaignRow {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  messageTemplate: string;
  status: string;
  scheduledFor: Date | null;
  intervalSeconds: number;
  dailyLimit: number;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  pausedReason: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CampaignRecipientRow {
  id: string;
  tenantId: string;
  campaignId: string;
  contactId: string;
  status: string;
  skipReason: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  repliedAt: Date | null;
  conversationId: string | null;
  createdAt: Date;
}

function toDomain(row: CampaignRow): Campaign {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    name: row.name,
    messageTemplate: row.messageTemplate,
    status: STATUS_FROM_PRISMA[row.status] ?? 'draft',
    scheduledFor: row.scheduledFor ?? undefined,
    intervalSeconds: row.intervalSeconds,
    dailyLimit: row.dailyLimit,
    sendWindowStart: row.sendWindowStart ?? undefined,
    sendWindowEnd: row.sendWindowEnd ?? undefined,
    pausedReason: row.pausedReason ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function recipientToDomain(row: CampaignRecipientRow): CampaignRecipient {
  return {
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    contactId: row.contactId,
    status: RECIPIENT_STATUS_FROM_PRISMA[row.status] ?? 'pending',
    skipReason: row.skipReason ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    sentAt: row.sentAt ?? undefined,
    repliedAt: row.repliedAt ?? undefined,
    conversationId: row.conversationId ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Implementação concreta de `CampaignRepository` — Fase L, Bloco L3.
 *
 * `fetchEligibility` é a única leitura que cruza para fora de
 * `campaigns`/`campaign_recipients` (tabelas `whatsapp_contacts` e
 * `whatsapp_conversations`) — ver docstring do port para o porquê disso ser
 * aceitável aqui (mesmo padrão de `PrismaAnalyticsRepository`).
 */
export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateCampaignData): Promise<Campaign> {
    const row = await this.prisma.campaign.create({
      data: {
        tenantId: data.tenantId,
        sessionName: data.sessionName,
        name: data.name,
        messageTemplate: data.messageTemplate,
        createdByUserId: data.createdByUserId ?? null,
        // Status sempre nasce DRAFT — este bloco não agenda/inicia envio.
      },
    });
    return toDomain(row);
  }

  async findById(tenantId: string, campaignId: string): Promise<Campaign | undefined> {
    const row = await this.prisma.campaign.findFirst({ where: { id: campaignId, tenantId } });
    return row ? toDomain(row) : undefined;
  }

  async listByTenant(tenantId: string, options: ListCampaignsOptions): Promise<CampaignPage> {
    const rows = await this.prisma.campaign.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    return {
      campaigns: page.map(toDomain),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }

  /**
   * Três consultas em paralelo, cada uma restrita a `contactIds` — nunca uma
   * varredura da base inteira:
   *
   * 1. `optOutAt` direto de `whatsapp_contacts`.
   * 2. Conversas com `status=HUMAN` e `assignedToUserId` preenchido, em
   *    QUALQUER sessão do tenant — "conversa ativa com humano" não é por
   *    sessão: alguém sendo atendido em um WhatsApp da empresa não deveria
   *    receber campanha por outro.
   * 3. `CampaignRecipient` com `status=SENT` e `sentAt` dentro da janela de 7
   *    dias, de QUALQUER campanha do tenant (não só a que está sendo criada
   *    agora — nesta rodada nunca há `SENT` nenhum, mas a consulta já fica
   *    correta para quando o L4/L5 existir).
   */
  async fetchEligibility(
    tenantId: string,
    contactIds: string[],
  ): Promise<Map<string, RecipientEligibility>> {
    if (contactIds.length === 0) {
      return new Map();
    }

    const [contacts, activeConversations, recentRecipients] = await Promise.all([
      this.prisma.whatsAppContact.findMany({
        where: { tenantId, id: { in: contactIds } },
        select: { id: true, optOutAt: true },
      }),
      this.prisma.whatsAppConversation.findMany({
        where: {
          tenantId,
          contactId: { in: contactIds },
          status: 'HUMAN',
          assignedToUserId: { not: null },
        },
        select: { contactId: true },
        distinct: ['contactId'],
      }),
      this.prisma.campaignRecipient.findMany({
        where: {
          tenantId,
          contactId: { in: contactIds },
          status: 'SENT',
          sentAt: { gte: new Date(Date.now() - RECENT_CONTACT_WINDOW_MS) },
        },
        select: { contactId: true },
        distinct: ['contactId'],
      }),
    ]);

    const activeConversationContactIds = new Set(
      activeConversations.map((row) => row.contactId).filter((id): id is string => id !== null),
    );
    const recentlyContactedContactIds = new Set(recentRecipients.map((row) => row.contactId));

    const eligibilityByContactId = new Map<string, RecipientEligibility>();
    for (const contact of contacts) {
      eligibilityByContactId.set(contact.id, {
        optedOut: contact.optOutAt !== null,
        hasActiveHumanConversation: activeConversationContactIds.has(contact.id),
        recentlyContactedByCampaign: recentlyContactedContactIds.has(contact.id),
      });
    }
    return eligibilityByContactId;
  }

  /**
   * `createMany({ skipDuplicates: true })`: apoiada no `@@unique([campaignId,
   * contactId])` do banco — materializar a mesma campanha duas vezes nunca
   * duplica um destinatário, sem checagem prévia na aplicação.
   */
  async createRecipients(
    tenantId: string,
    campaignId: string,
    recipients: CampaignRecipientDraft[],
  ): Promise<void> {
    if (recipients.length === 0) {
      return;
    }
    await this.prisma.campaignRecipient.createMany({
      data: recipients.map((recipient) => ({
        tenantId,
        campaignId,
        contactId: recipient.contactId,
        status: RECIPIENT_STATUS_TO_PRISMA[recipient.status],
        skipReason: recipient.skipReason ?? null,
      })),
      skipDuplicates: true,
    });
  }

  async summarizeRecipients(
    tenantId: string,
    campaignId: string,
  ): Promise<CampaignRecipientSummary> {
    const rows = await this.prisma.campaignRecipient.groupBy({
      by: ['status', 'skipReason'],
      where: { tenantId, campaignId },
      _count: { _all: true },
    });

    let total = 0;
    let pending = 0;
    let skipped = 0;
    const skipReasons: Partial<Record<CampaignSkipReason, number>> = {};

    for (const row of rows) {
      const count = row._count._all;
      total += count;
      if (row.status === 'PENDING') {
        pending += count;
      } else if (row.status === 'SKIPPED') {
        skipped += count;
        const reason = row.skipReason as CampaignSkipReason | null;
        if (reason) {
          skipReasons[reason] = (skipReasons[reason] ?? 0) + count;
        }
      }
    }

    return { total, pending, skipped, skipReasons };
  }

  async listRecipients(
    tenantId: string,
    campaignId: string,
    options: ListCampaignRecipientsOptions,
  ): Promise<CampaignRecipientPage> {
    const rows = await this.prisma.campaignRecipient.findMany({
      where: {
        tenantId,
        campaignId,
        ...(options.status ? { status: recipientStatusToPrismaFilter(options.status) } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    return {
      recipients: page.map(recipientToDomain),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }
}

/** Mapeia o filtro de status (união completa, incluindo `sent`/`failed`/`replied` — ainda não produzidos por L3, mas já corretos para L4/L5). */
function recipientStatusToPrismaFilter(
  status: NonNullable<ListCampaignRecipientsOptions['status']>,
): PrismaCampaignRecipientStatus {
  const map: Record<
    NonNullable<ListCampaignRecipientsOptions['status']>,
    PrismaCampaignRecipientStatus
  > = {
    pending: 'PENDING',
    sent: 'SENT',
    failed: 'FAILED',
    skipped: 'SKIPPED',
    replied: 'REPLIED',
  };
  return map[status];
}
