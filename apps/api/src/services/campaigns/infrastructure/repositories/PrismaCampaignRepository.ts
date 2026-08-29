import type {
  PrismaClient,
  CampaignRecipientStatus as PrismaCampaignRecipientStatus,
  CampaignStatus as PrismaCampaignStatus,
} from '@prisma/client';

import {
  Campaign,
  CampaignRecipient,
  CampaignRecipientStatus,
  CampaignRecipientSummary,
  CampaignSkipReason,
  CampaignStatus,
  CampaignMetrics,
  CampaignLinkedConversationStage,
  CampaignSessionOverview,
  CampaignMediaContentType,
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
import { CampaignSendOutcome } from '../../domain/policies/shouldTripCircuitBreaker';

/** Janela de "contatado recentemente por outra campanha" — mesmo valor citado na análise aprovada (`FASE_L_MOTOR_DE_LEADS.md`). */
const RECENT_CONTACT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const STATUS_TO_PRISMA: Record<CampaignStatus, PrismaCampaignStatus> = {
  draft: 'DRAFT',
  scheduled: 'SCHEDULED',
  running: 'RUNNING',
  paused: 'PAUSED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

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

/** Fase L, Bloco L8 — mesmo enum Prisma de `WhatsAppMessage.contentType`, restrito às 4 categorias que fazem sentido para um anexo de campanha (nunca `TEXT`/`STICKER`). */
const MEDIA_CONTENT_TYPE_TO_PRISMA: Record<CampaignMediaContentType, string> = {
  image: 'IMAGE',
  audio: 'AUDIO',
  video: 'VIDEO',
  document: 'DOCUMENT',
};

const MEDIA_CONTENT_TYPE_FROM_PRISMA: Record<string, CampaignMediaContentType> = {
  IMAGE: 'image',
  AUDIO: 'audio',
  VIDEO: 'video',
  DOCUMENT: 'document',
};

interface CampaignRow {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  description: string | null;
  messageTemplate: string;
  status: string;
  scheduledFor: Date | null;
  intervalSeconds: number;
  dailyLimit: number;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  pausedReason: string | null;
  createdByUserId: string | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaContentType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Explícito de propósito (Fase L, Bloco L8) — a diferença para "todas as
 * colunas escalares" (comportamento default do Prisma sem `select`) é
 * EXATAMENTE `mediaContent`: o binário nunca deve entrar numa resposta JSON
 * de lista/detalhe (`findById`/`listByTenant`), só na rota de download
 * dedicada (`getMediaContent`, com seu próprio `select` restrito). Usado por
 * `create`/`findById`/`listByTenant` — os três pontos que devolvem `Campaign`
 * inteiro ao chamador.
 */
const CAMPAIGN_SELECT = {
  id: true,
  tenantId: true,
  sessionName: true,
  name: true,
  description: true,
  messageTemplate: true,
  status: true,
  scheduledFor: true,
  intervalSeconds: true,
  dailyLimit: true,
  sendWindowStart: true,
  sendWindowEnd: true,
  pausedReason: true,
  createdByUserId: true,
  mediaMimeType: true,
  mediaFileName: true,
  mediaContentType: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface CampaignRecipientRow {
  id: string;
  tenantId: string;
  campaignId: string;
  contactId: string | null;
  phoneE164: string | null;
  name: string | null;
  personalizedMessage: string | null;
  status: string;
  skipReason: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  repliedAt: Date | null;
  conversationId: string | null;
  attemptedAt: Date | null;
  createdAt: Date;
}

function toDomain(row: CampaignRow): Campaign {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    name: row.name,
    description: row.description ?? undefined,
    messageTemplate: row.messageTemplate,
    status: STATUS_FROM_PRISMA[row.status] ?? 'draft',
    scheduledFor: row.scheduledFor ?? undefined,
    intervalSeconds: row.intervalSeconds,
    dailyLimit: row.dailyLimit,
    sendWindowStart: row.sendWindowStart ?? undefined,
    sendWindowEnd: row.sendWindowEnd ?? undefined,
    pausedReason: row.pausedReason ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    // As três colunas de mídia nascem/são limpas JUNTAS (`attachMedia`/
    // `removeMedia`) — checar só `mediaContentType` basta para decidir se há
    // anexo, mas `mediaMimeType` nunca é `null` quando ele não é (garantia da
    // aplicação, não de CHECK no banco).
    media: row.mediaContentType
      ? {
          contentType: MEDIA_CONTENT_TYPE_FROM_PRISMA[row.mediaContentType] ?? 'document',
          mimeType: row.mediaMimeType ?? 'application/octet-stream',
          fileName: row.mediaFileName ?? undefined,
        }
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Resolvido em lote por `listRecipients` — ver docstring de `CampaignRecipient.contact`. */
interface RecipientContactInfo {
  name?: string;
  phoneE164: string;
  nickname?: string;
}

function recipientToDomain(
  row: CampaignRecipientRow,
  contact?: RecipientContactInfo,
): CampaignRecipient {
  return {
    id: row.id,
    tenantId: row.tenantId,
    campaignId: row.campaignId,
    contactId: row.contactId ?? undefined,
    phoneE164: row.phoneE164 ?? undefined,
    name: row.name ?? undefined,
    personalizedMessage: row.personalizedMessage ?? undefined,
    contact,
    status: RECIPIENT_STATUS_FROM_PRISMA[row.status] ?? 'pending',
    skipReason: row.skipReason ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    sentAt: row.sentAt ?? undefined,
    repliedAt: row.repliedAt ?? undefined,
    conversationId: row.conversationId ?? undefined,
    attemptedAt: row.attemptedAt ?? undefined,
    createdAt: row.createdAt,
  };
}

/**
 * Implementação concreta de `CampaignRepository` — Fase L, Bloco L3.
 *
 * `fetchEligibility` é a única leitura que cruza para fora de
 * `campaigns`/`campaign_recipients` (tabelas `whatsapp_contacts` e
 * `whatsapp_conversations`) — ver docstring do port para o porquê disso ser
 * aceitável aqui (mesmo padrão de `PrismaAnalyticsRepository`). Escopada por
 * sessão desde 2026-08-20 — ver docstring de `fetchEligibility` abaixo.
 */
export class PrismaCampaignRepository implements CampaignRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateCampaignData): Promise<Campaign> {
    const row = await this.prisma.campaign.create({
      data: {
        tenantId: data.tenantId,
        sessionName: data.sessionName,
        name: data.name,
        description: data.description ?? null,
        messageTemplate: data.messageTemplate,
        createdByUserId: data.createdByUserId ?? null,
        // Status sempre nasce DRAFT — este bloco não agenda/inicia envio.
      },
      select: CAMPAIGN_SELECT,
    });
    return toDomain(row);
  }

  async findById(tenantId: string, campaignId: string): Promise<Campaign | undefined> {
    const row = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: CAMPAIGN_SELECT,
    });
    return row ? toDomain(row) : undefined;
  }

  async listByTenant(tenantId: string, options: ListCampaignsOptions): Promise<CampaignPage> {
    const rows = await this.prisma.campaign.findMany({
      where: { tenantId, ...(options.sessionName ? { sessionName: options.sessionName } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      select: CAMPAIGN_SELECT,
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
   * 1. `optOutAt` direto de `whatsapp_contacts` (tenant-wide de propósito —
   *    opt-out é da PESSOA, não do WhatsApp por onde ela pediu para sair).
   * 2. Conversas com `status=HUMAN` e `assignedToUserId` preenchido, NESTA
   *    sessão (correção 2026-08-20, achado real: um contato em atendimento
   *    humano no WhatsApp A bloqueava campanha no WhatsApp B — "cada
   *    WhatsApp é uma empresa independente", mesmo racional da navegação
   *    desde a M6H-1; a versão anterior desta consulta era tenant-wide).
   * 3. `CampaignRecipient` com `status=SENT` e `sentAt` dentro da janela de 7
   *    dias, de QUALQUER campanha DESTA MESMA sessão (mesma correção — não
   *    faz sentido "contatado recentemente" bloquear por uma campanha de
   *    outro WhatsApp).
   */
  async fetchEligibility(
    tenantId: string,
    sessionName: string,
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
          sessionName,
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
          campaign: { sessionName },
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
        contactId: recipient.contactId ?? null,
        phoneE164: recipient.phoneE164 ?? null,
        name: recipient.name ?? null,
        personalizedMessage: recipient.personalizedMessage ?? null,
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

  /**
   * Padronização de exibição de contato (2026-08-20) — depois de paginar,
   * resolve `contact` (nome salvo + telefone + apelido do WhatsApp) EM LOTE
   * para os destinatários com `contactId` definido: uma consulta a
   * `whatsapp_contacts` (nunca uma por linha, `contactId in [...]`) e uma
   * segunda a `whatsapp_conversations` (`conversationId in [...]`) para o
   * apelido — mesmo racional de "leitura de relatório cruzando tabelas" já
   * usado por `fetchEligibility` (ver docstring da classe). Sem a segunda
   * consulta um destinatário com Contato ainda sem nome salvo apareceria só
   * com o telefone, mesmo já tendo respondido (e portanto tendo um apelido
   * de WhatsApp capturado) — dado que já existe, só não estava sendo lido.
   */
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

    const contactIds = [
      ...new Set(page.map((row) => row.contactId).filter((id): id is string => Boolean(id))),
    ];
    const conversationIds = [
      ...new Set(page.map((row) => row.conversationId).filter((id): id is string => Boolean(id))),
    ];

    const [contacts, conversations] = await Promise.all([
      contactIds.length
        ? this.prisma.whatsAppContact.findMany({
            where: { id: { in: contactIds }, tenantId },
            select: { id: true, name: true, phoneE164: true },
          })
        : Promise.resolve([]),
      conversationIds.length
        ? this.prisma.whatsAppConversation.findMany({
            where: { id: { in: conversationIds }, tenantId },
            select: { id: true, contactName: true },
          })
        : Promise.resolve([]),
    ]);

    const contactById = new Map(contacts.map((contact) => [contact.id, contact]));
    const nicknameByConversationId = new Map(
      conversations.map((conversation) => [conversation.id, conversation.contactName ?? undefined]),
    );

    return {
      recipients: page.map((row) => {
        const contact = row.contactId ? contactById.get(row.contactId) : undefined;
        const contactInfo: RecipientContactInfo | undefined = contact
          ? {
              name: contact.name ?? undefined,
              phoneE164: contact.phoneE164,
              nickname: row.conversationId
                ? nicknameByConversationId.get(row.conversationId)
                : undefined,
            }
          : undefined;
        return recipientToDomain(row, contactInfo);
      }),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }

  // --- Fase L, Bloco L4 (motor de envio) ---

  async findRecipientById(
    tenantId: string,
    recipientId: string,
  ): Promise<CampaignRecipient | undefined> {
    const row = await this.prisma.campaignRecipient.findFirst({
      where: { id: recipientId, tenantId },
    });
    return row ? recipientToDomain(row) : undefined;
  }

  async listPendingRecipients(tenantId: string, campaignId: string): Promise<CampaignRecipient[]> {
    const rows = await this.prisma.campaignRecipient.findMany({
      where: { tenantId, campaignId, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => recipientToDomain(row));
  }

  async countSentToday(tenantId: string, campaignId: string): Promise<number> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return this.prisma.campaignRecipient.count({
      where: { tenantId, campaignId, status: 'SENT', sentAt: { gte: startOfToday } },
    });
  }

  async countPending(tenantId: string, campaignId: string): Promise<number> {
    return this.prisma.campaignRecipient.count({
      where: { tenantId, campaignId, status: 'PENDING' },
    });
  }

  async markRecipientSent(
    tenantId: string,
    recipientId: string,
    data: { attemptedAt: Date; conversationId: string },
  ): Promise<void> {
    await this.prisma.campaignRecipient.updateMany({
      where: { id: recipientId, tenantId },
      data: {
        status: 'SENT',
        sentAt: data.attemptedAt,
        attemptedAt: data.attemptedAt,
        conversationId: data.conversationId,
      },
    });
  }

  async markRecipientFailed(
    tenantId: string,
    recipientId: string,
    data: { attemptedAt: Date; errorMessage: string },
  ): Promise<void> {
    await this.prisma.campaignRecipient.updateMany({
      where: { id: recipientId, tenantId },
      data: { status: 'FAILED', attemptedAt: data.attemptedAt, errorMessage: data.errorMessage },
    });
  }

  async resetFailedRecipientsToPending(tenantId: string, campaignId: string): Promise<number> {
    const { count } = await this.prisma.campaignRecipient.updateMany({
      where: { tenantId, campaignId, status: 'FAILED' },
      data: { status: 'PENDING', errorMessage: null },
    });
    return count;
  }

  /**
   * `SENT`/`FAILED` mais recentes desta campanha, por `attemptedAt` DESC —
   * alimenta `shouldTripCircuitBreaker`. `SKIPPED`/`PENDING`/`REPLIED` nunca
   * entram nesta amostra (não são tentativas de ENVIO).
   */
  async listRecentOutcomes(
    tenantId: string,
    campaignId: string,
    limit: number,
  ): Promise<CampaignSendOutcome[]> {
    const rows = await this.prisma.campaignRecipient.findMany({
      where: { tenantId, campaignId, status: { in: ['SENT', 'FAILED'] } },
      orderBy: { attemptedAt: 'desc' },
      take: limit,
      select: { status: true },
    });
    return rows.map((row) => (row.status === 'SENT' ? 'sent' : 'failed'));
  }

  async updateCampaignStatus(
    tenantId: string,
    campaignId: string,
    status: CampaignStatus,
    pausedReason?: string,
  ): Promise<Campaign | undefined> {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id: campaignId, tenantId },
      data: {
        status: STATUS_TO_PRISMA[status],
        // Só grava `pausedReason` de fato quando é uma pausa — retomar
        // (`running`)/cancelar/concluir limpa o motivo anterior, para a UI
        // nunca mostrar um aviso de pausa obsoleto numa campanha ativa.
        pausedReason: status === 'paused' ? (pausedReason ?? null) : null,
      },
    });
    if (count === 0) {
      return undefined;
    }
    return this.findById(tenantId, campaignId);
  }

  async deleteById(tenantId: string, campaignId: string): Promise<boolean> {
    const { count } = await this.prisma.campaign.deleteMany({
      where: { id: campaignId, tenantId },
    });
    return count > 0;
  }

  // --- Fase L, Bloco L6 ---

  async markRepliedByConversationId(tenantId: string, conversationId: string): Promise<void> {
    await this.prisma.campaignRecipient.updateMany({
      where: { tenantId, conversationId, status: 'SENT' },
      data: { status: 'REPLIED', repliedAt: new Date() },
    });
  }

  async findOriginByConversationId(
    tenantId: string,
    conversationId: string,
  ): Promise<{ messageSent: string } | undefined> {
    const row = await this.prisma.campaignRecipient.findFirst({
      where: { tenantId, conversationId, status: { in: ['SENT', 'REPLIED'] } },
      orderBy: { sentAt: 'desc' },
      select: { campaign: { select: { messageTemplate: true } } },
    });
    return row ? { messageSent: row.campaign.messageTemplate } : undefined;
  }

  // --- Fase L, Bloco L7 (métricas) ---

  /**
   * Um único `findMany` de todos os destinatários da campanha (limitados a
   * 5.000 pela própria criação — `createCampaignBodySchema.contactIds.max(5000)`,
   * `campaignsRouter.ts` — então caber tudo em memória é seguro), em vez de
   * vários `groupBy` — mais simples de auditar e mais barato para o volume
   * real deste produto. As duas consultas cruzadas (`whatsapp_conversations`/
   * `ai_interactions`) ficam restritas aos `conversationId` desta campanha,
   * nunca uma varredura ampla.
   */
  async getMetrics(tenantId: string, campaignId: string): Promise<CampaignMetrics | undefined> {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: { id: true },
    });
    if (!campaign) {
      return undefined;
    }

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { tenantId, campaignId },
      select: {
        status: true,
        skipReason: true,
        conversationId: true,
        sentAt: true,
        repliedAt: true,
      },
    });

    let pending = 0;
    let sent = 0;
    let failed = 0;
    let replied = 0;
    let skipped = 0;
    const skipReasons: Partial<Record<CampaignSkipReason, number>> = {};
    const conversationIds = new Set<string>();
    const replyDurationsMs: number[] = [];

    for (const row of recipients) {
      if (row.conversationId) {
        conversationIds.add(row.conversationId);
      }
      switch (row.status) {
        case 'PENDING':
          pending += 1;
          break;
        case 'SENT':
          sent += 1;
          break;
        case 'FAILED':
          failed += 1;
          break;
        case 'REPLIED':
          replied += 1;
          if (row.sentAt && row.repliedAt) {
            replyDurationsMs.push(row.repliedAt.getTime() - row.sentAt.getTime());
          }
          break;
        case 'SKIPPED':
          skipped += 1;
          if (row.skipReason) {
            const reason = row.skipReason as CampaignSkipReason;
            skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
          }
          break;
      }
    }

    const attempted = sent + failed + replied;
    const responseRate = attempted > 0 ? replied / attempted : undefined;
    const avgTimeToFirstReplyMinutes =
      replyDurationsMs.length > 0
        ? replyDurationsMs.reduce((sum, ms) => sum + ms, 0) / replyDurationsMs.length / 60_000
        : undefined;

    const stageCounts: Record<CampaignLinkedConversationStage, number> = {
      new: 0,
      contacted: 0,
      negotiating: 0,
      closed_won: 0,
      closed_lost: 0,
    };
    let escalatedCount = 0;

    if (conversationIds.size > 0) {
      const conversations = await this.prisma.whatsAppConversation.findMany({
        where: { tenantId, id: { in: [...conversationIds] } },
        select: { stage: true, escalatedAt: true },
      });
      for (const conversation of conversations) {
        stageCounts[STAGE_FROM_PRISMA[conversation.stage]] += 1;
        if (conversation.escalatedAt) {
          escalatedCount += 1;
        }
      }
    }

    const conversionRate =
      conversationIds.size > 0 ? stageCounts.closed_won / conversationIds.size : undefined;

    let aiCostUsd = 0;
    let unknownAnswerCount = 0;
    if (conversationIds.size > 0) {
      const interactions = await this.prisma.aiInteraction.findMany({
        where: { tenantId, conversationId: { in: [...conversationIds] } },
        select: { costUsd: true, escalationReason: true },
      });
      for (const interaction of interactions) {
        aiCostUsd += Number(interaction.costUsd);
        if (interaction.escalationReason === 'UNKNOWN_ANSWER') {
          unknownAnswerCount += 1;
        }
      }
    }
    const costPerConversionUsd =
      stageCounts.closed_won > 0 ? aiCostUsd / stageCounts.closed_won : undefined;

    return {
      total: recipients.length,
      pending,
      sent,
      failed,
      replied,
      skipped,
      skipReasons,
      responseRate,
      avgTimeToFirstReplyMinutes,
      stageCounts,
      escalatedCount,
      conversionRate,
      aiCostUsd,
      costPerConversionUsd,
      unknownAnswerCount,
    };
  }

  // --- Retrofit visual 2026-08-18 (réplica de imagem) ---

  /**
   * `statusCounts`/`totalSent`/`totalReplied` (acumulado histórico) +
   * `trends` (este mês vs. mês anterior, por `sentAt`/`repliedAt`/
   * `createdAt` — nunca inventa uma tendência quando o mês anterior é 0).
   * Nove consultas baratas em paralelo (todas restritas a
   * `tenantId`+`sessionName`, com os índices já existentes) — mais simples
   * de auditar que uma única consulta SQL manual com `date_trunc`.
   */
  async getSessionOverview(
    tenantId: string,
    sessionName: string,
  ): Promise<CampaignSessionOverview> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const campaignScope = { tenantId, sessionName };
    const recipientScope = { tenantId, campaign: { sessionName } };

    const [
      statusRows,
      totalSent,
      totalReplied,
      campaignsThisMonth,
      campaignsLastMonth,
      sentThisMonth,
      sentLastMonth,
      repliedThisMonth,
      repliedLastMonth,
    ] = await Promise.all([
      this.prisma.campaign.groupBy({
        by: ['status'],
        where: campaignScope,
        _count: { _all: true },
      }),
      this.prisma.campaignRecipient.count({
        where: { ...recipientScope, status: { in: ['SENT', 'REPLIED'] } },
      }),
      this.prisma.campaignRecipient.count({
        where: { ...recipientScope, status: 'REPLIED' },
      }),
      this.prisma.campaign.count({
        where: { ...campaignScope, createdAt: { gte: currentMonthStart } },
      }),
      this.prisma.campaign.count({
        where: { ...campaignScope, createdAt: { gte: previousMonthStart, lt: currentMonthStart } },
      }),
      this.prisma.campaignRecipient.count({
        where: {
          ...recipientScope,
          status: { in: ['SENT', 'REPLIED'] },
          sentAt: { gte: currentMonthStart },
        },
      }),
      this.prisma.campaignRecipient.count({
        where: {
          ...recipientScope,
          status: { in: ['SENT', 'REPLIED'] },
          sentAt: { gte: previousMonthStart, lt: currentMonthStart },
        },
      }),
      this.prisma.campaignRecipient.count({
        where: { ...recipientScope, status: 'REPLIED', repliedAt: { gte: currentMonthStart } },
      }),
      this.prisma.campaignRecipient.count({
        where: {
          ...recipientScope,
          status: 'REPLIED',
          repliedAt: { gte: previousMonthStart, lt: currentMonthStart },
        },
      }),
    ]);

    const statusCounts: Record<CampaignStatus, number> = {
      draft: 0,
      scheduled: 0,
      running: 0,
      paused: 0,
      completed: 0,
      cancelled: 0,
    };
    let totalCampaigns = 0;
    for (const row of statusRows) {
      const status = STATUS_FROM_PRISMA[row.status];
      statusCounts[status] = row._count._all;
      totalCampaigns += row._count._all;
    }

    const responseRateThisMonth = sentThisMonth > 0 ? repliedThisMonth / sentThisMonth : undefined;
    const responseRateLastMonth = sentLastMonth > 0 ? repliedLastMonth / sentLastMonth : undefined;

    return {
      totalCampaigns,
      statusCounts,
      totalSent,
      totalReplied,
      responseRate: totalSent > 0 ? totalReplied / totalSent : undefined,
      trends: {
        campaignsDeltaPct: deltaPct(campaignsThisMonth, campaignsLastMonth),
        messagesSentDeltaPct: deltaPct(sentThisMonth, sentLastMonth),
        repliesDeltaPct: deltaPct(repliedThisMonth, repliedLastMonth),
        responseRateDeltaPct:
          responseRateThisMonth !== undefined && responseRateLastMonth !== undefined
            ? deltaPct(responseRateThisMonth, responseRateLastMonth)
            : undefined,
      },
    };
  }

  // --- Fase L, Bloco L8 (mídia na campanha) ---

  async attachMedia(
    tenantId: string,
    campaignId: string,
    media: {
      contentType: CampaignMediaContentType;
      buffer: Buffer;
      mimeType: string;
      fileName?: string;
    },
  ): Promise<Campaign | undefined> {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id: campaignId, tenantId },
      data: {
        mediaContent: media.buffer,
        mediaMimeType: media.mimeType,
        mediaFileName: media.fileName ?? null,
        mediaContentType: MEDIA_CONTENT_TYPE_TO_PRISMA[media.contentType] as never,
      },
    });
    if (count === 0) {
      return undefined;
    }
    return this.findById(tenantId, campaignId);
  }

  async removeMedia(tenantId: string, campaignId: string): Promise<Campaign | undefined> {
    const { count } = await this.prisma.campaign.updateMany({
      where: { id: campaignId, tenantId },
      data: {
        mediaContent: null,
        mediaMimeType: null,
        mediaFileName: null,
        mediaContentType: null,
      },
    });
    if (count === 0) {
      return undefined;
    }
    return this.findById(tenantId, campaignId);
  }

  async getMediaContent(
    tenantId: string,
    campaignId: string,
  ): Promise<
    | { contentType: CampaignMediaContentType; buffer: Buffer; mimeType: string; fileName?: string }
    | undefined
  > {
    const row = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      select: {
        mediaContent: true,
        mediaMimeType: true,
        mediaFileName: true,
        mediaContentType: true,
      },
    });
    if (!row || !row.mediaContent || !row.mediaContentType) {
      return undefined;
    }
    return {
      contentType: MEDIA_CONTENT_TYPE_FROM_PRISMA[row.mediaContentType] ?? 'document',
      buffer: Buffer.from(row.mediaContent),
      mimeType: row.mediaMimeType ?? 'application/octet-stream',
      fileName: row.mediaFileName ?? undefined,
    };
  }
}

/**
 * `((current - previous) / previous) * 100`, arredondado — `undefined`
 * quando `previous` é 0 (não há base para comparar; nunca vira "0%" ou
 * "∞%" disfarçado).
 */
function deltaPct(current: number, previous: number): number | undefined {
  if (previous === 0) return undefined;
  return Math.round(((current - previous) / previous) * 100);
}

/** Mapeia `WhatsAppConversation.stage` (Prisma) para o literal de `CampaignLinkedConversationStage` — mesmos 5 valores de `Conversation['stage']` (`services/conversations`), duplicado de propósito (ver docstring do tipo). */
const STAGE_FROM_PRISMA: Record<string, CampaignLinkedConversationStage> = {
  NEW: 'new',
  CONTACTED: 'contacted',
  NEGOTIATING: 'negotiating',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost',
};

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
