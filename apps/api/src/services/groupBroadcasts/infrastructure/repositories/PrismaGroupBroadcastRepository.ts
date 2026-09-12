import type {
  PrismaClient,
  CampaignStatus as PrismaCampaignStatus,
  GroupBroadcastTargetStatus as PrismaTargetStatus,
} from '@prisma/client';

import {
  GroupBroadcast,
  GroupBroadcastMediaContentType,
  GroupBroadcastStatus,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
  GroupBroadcastTargetStatus,
} from '../../domain/entities/GroupBroadcast';
import {
  CreateGroupBroadcastData,
  GroupBroadcastMediaContent,
  GroupBroadcastRepository,
  GroupBroadcastTargetDraft,
} from '../../domain/repositories/GroupBroadcastRepository';

const STATUS_TO_PRISMA: Record<GroupBroadcastStatus, PrismaCampaignStatus> = {
  draft: 'DRAFT',
  scheduled: 'SCHEDULED',
  running: 'RUNNING',
  paused: 'PAUSED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

const STATUS_FROM_PRISMA: Record<string, GroupBroadcastStatus> = {
  DRAFT: 'draft',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const TARGET_STATUS_TO_PRISMA: Record<GroupBroadcastTargetStatus, PrismaTargetStatus> = {
  pending: 'PENDING',
  sent: 'SENT',
  failed: 'FAILED',
  skipped: 'SKIPPED',
};

const TARGET_STATUS_FROM_PRISMA: Record<string, GroupBroadcastTargetStatus> = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped',
};

/** Reaproveita o enum `WhatsAppMessageContentType` (mesmo formato do Bloco L8), restrito a imagem/vídeo. */
const MEDIA_TYPE_TO_PRISMA: Record<GroupBroadcastMediaContentType, 'IMAGE' | 'VIDEO'> = {
  image: 'IMAGE',
  video: 'VIDEO',
};

const MEDIA_TYPE_FROM_PRISMA: Record<string, GroupBroadcastMediaContentType> = {
  IMAGE: 'image',
  VIDEO: 'video',
};

/**
 * `select` EXPLÍCITO — a diferença para "todas as colunas" é exatamente
 * `mediaContent`. O binário (até 16MB num vídeo) nunca pode entrar numa
 * resposta JSON de lista/detalhe; só `getMediaContent` o lê. Mesma decisão e
 * mesma razão de `CAMPAIGN_SELECT` (Bloco L8) — provado contra Postgres real
 * em `groupBroadcasts.integration.test.ts`.
 */
const GROUP_BROADCAST_SELECT = {
  id: true,
  tenantId: true,
  sessionName: true,
  name: true,
  messageTemplate: true,
  status: true,
  intervalSeconds: true,
  recurrenceIntervalHours: true,
  recurrenceMaxRuns: true,
  recurrenceEndsAt: true,
  sendWindowStart: true,
  sendWindowEnd: true,
  runsCompleted: true,
  nextRunAt: true,
  pausedReason: true,
  createdByUserId: true,
  mediaMimeType: true,
  mediaFileName: true,
  mediaContentType: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface GroupBroadcastRow {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  messageTemplate: string;
  status: string;
  intervalSeconds: number;
  recurrenceIntervalHours: number | null;
  recurrenceMaxRuns: number | null;
  recurrenceEndsAt: Date | null;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  runsCompleted: number;
  nextRunAt: Date | null;
  pausedReason: string | null;
  createdByUserId: string | null;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaContentType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface GroupBroadcastTargetRow {
  id: string;
  tenantId: string;
  broadcastId: string;
  groupJid: string;
  groupName: string;
  status: string;
  skipReason: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  attemptedAt: Date | null;
  sentCount: number;
  createdAt: Date;
}

function toDomain(row: GroupBroadcastRow): GroupBroadcast {
  const mediaContentType = row.mediaContentType
    ? MEDIA_TYPE_FROM_PRISMA[row.mediaContentType]
    : undefined;
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    name: row.name,
    messageTemplate: row.messageTemplate,
    status: STATUS_FROM_PRISMA[row.status] ?? 'draft',
    intervalSeconds: row.intervalSeconds,
    recurrenceIntervalHours: row.recurrenceIntervalHours ?? undefined,
    recurrenceMaxRuns: row.recurrenceMaxRuns ?? undefined,
    recurrenceEndsAt: row.recurrenceEndsAt ?? undefined,
    sendWindowStart: row.sendWindowStart ?? undefined,
    sendWindowEnd: row.sendWindowEnd ?? undefined,
    runsCompleted: row.runsCompleted,
    nextRunAt: row.nextRunAt ?? undefined,
    pausedReason: row.pausedReason ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    // As colunas de mídia nascem/são limpas juntas (`attachMedia`/`removeMedia`).
    media: mediaContentType
      ? {
          contentType: mediaContentType,
          mimeType: row.mediaMimeType ?? 'application/octet-stream',
          fileName: row.mediaFileName ?? undefined,
        }
      : undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function targetToDomain(row: GroupBroadcastTargetRow): GroupBroadcastTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    broadcastId: row.broadcastId,
    groupJid: row.groupJid,
    groupName: row.groupName,
    status: TARGET_STATUS_FROM_PRISMA[row.status] ?? 'pending',
    skipReason: row.skipReason ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    sentAt: row.sentAt ?? undefined,
    attemptedAt: row.attemptedAt ?? undefined,
    sentCount: row.sentCount,
    createdAt: row.createdAt,
  };
}

function emptySummary(): GroupBroadcastSummary {
  return { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 };
}

function addToSummary(summary: GroupBroadcastSummary, status: string, count: number): void {
  const key = TARGET_STATUS_FROM_PRISMA[status];
  if (!key) return;
  summary[key] += count;
  summary.total += count;
}

/** Implementação Postgres de `GroupBroadcastRepository` — toda consulta escopada por `tenantId`. */
export class PrismaGroupBroadcastRepository implements GroupBroadcastRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateGroupBroadcastData): Promise<GroupBroadcast> {
    const row = await this.prisma.groupBroadcast.create({
      data: {
        tenantId: data.tenantId,
        sessionName: data.sessionName,
        name: data.name,
        messageTemplate: data.messageTemplate,
        intervalSeconds: data.intervalSeconds,
        recurrenceIntervalHours: data.recurrenceIntervalHours ?? null,
        recurrenceMaxRuns: data.recurrenceMaxRuns ?? null,
        recurrenceEndsAt: data.recurrenceEndsAt ?? null,
        sendWindowStart: data.sendWindowStart ?? null,
        sendWindowEnd: data.sendWindowEnd ?? null,
        createdByUserId: data.createdByUserId ?? null,
      },
      select: GROUP_BROADCAST_SELECT,
    });
    return toDomain(row);
  }

  async createTargets(
    tenantId: string,
    broadcastId: string,
    drafts: GroupBroadcastTargetDraft[],
  ): Promise<void> {
    if (drafts.length === 0) return;
    await this.prisma.groupBroadcastTarget.createMany({
      data: drafts.map((draft) => ({
        tenantId,
        broadcastId,
        groupJid: draft.groupJid,
        groupName: draft.groupName,
        status: TARGET_STATUS_TO_PRISMA[draft.status],
        skipReason: draft.skipReason ?? null,
      })),
      skipDuplicates: true,
    });
  }

  async findById(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined> {
    const row = await this.prisma.groupBroadcast.findFirst({
      where: { id: broadcastId, tenantId },
      select: GROUP_BROADCAST_SELECT,
    });
    return row ? toDomain(row) : undefined;
  }

  async listBySession(
    tenantId: string,
    sessionName: string,
    limit: number,
  ): Promise<GroupBroadcast[]> {
    const rows = await this.prisma.groupBroadcast.findMany({
      where: { tenantId, sessionName },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: GROUP_BROADCAST_SELECT,
    });
    return rows.map(toDomain);
  }

  async listTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastTarget[]> {
    const rows = await this.prisma.groupBroadcastTarget.findMany({
      where: { tenantId, broadcastId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(targetToDomain);
  }

  async findTargetById(
    tenantId: string,
    targetId: string,
  ): Promise<GroupBroadcastTarget | undefined> {
    const row = await this.prisma.groupBroadcastTarget.findFirst({
      where: { id: targetId, tenantId },
    });
    return row ? targetToDomain(row) : undefined;
  }

  async listPendingTargets(
    tenantId: string,
    broadcastId: string,
  ): Promise<GroupBroadcastTarget[]> {
    const rows = await this.prisma.groupBroadcastTarget.findMany({
      where: { tenantId, broadcastId, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(targetToDomain);
  }

  async summarizeTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastSummary> {
    const groups = await this.prisma.groupBroadcastTarget.groupBy({
      by: ['status'],
      where: { tenantId, broadcastId },
      _count: { _all: true },
    });
    const summary = emptySummary();
    for (const group of groups) {
      addToSummary(summary, group.status, group._count._all);
    }
    return summary;
  }

  async summarizeTargetsForBroadcasts(
    tenantId: string,
    broadcastIds: string[],
  ): Promise<Map<string, GroupBroadcastSummary>> {
    const result = new Map<string, GroupBroadcastSummary>();
    if (broadcastIds.length === 0) return result;
    const groups = await this.prisma.groupBroadcastTarget.groupBy({
      by: ['broadcastId', 'status'],
      where: { tenantId, broadcastId: { in: broadcastIds } },
      _count: { _all: true },
    });
    for (const group of groups) {
      const summary = result.get(group.broadcastId) ?? emptySummary();
      addToSummary(summary, group.status, group._count._all);
      result.set(group.broadcastId, summary);
    }
    return result;
  }

  async markTargetSent(tenantId: string, targetId: string, attemptedAt: Date): Promise<void> {
    await this.prisma.groupBroadcastTarget.updateMany({
      where: { id: targetId, tenantId, status: 'PENDING' },
      data: {
        status: 'SENT',
        sentAt: attemptedAt,
        attemptedAt,
        errorMessage: null,
        sentCount: { increment: 1 },
      },
    });
  }

  async markTargetFailed(
    tenantId: string,
    targetId: string,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.groupBroadcastTarget.updateMany({
      where: { id: targetId, tenantId, status: 'PENDING' },
      data: { status: 'FAILED', attemptedAt, errorMessage },
    });
  }

  async listRecentOutcomes(
    tenantId: string,
    broadcastId: string,
    limit: number,
  ): Promise<Array<'sent' | 'failed'>> {
    const rows = await this.prisma.groupBroadcastTarget.findMany({
      where: {
        tenantId,
        broadcastId,
        attemptedAt: { not: null },
        status: { in: ['SENT', 'FAILED'] },
      },
      orderBy: { attemptedAt: 'desc' },
      take: limit,
      select: { status: true },
    });
    return rows.map((row) => (row.status === 'SENT' ? 'sent' : 'failed'));
  }

  async countPending(tenantId: string, broadcastId: string): Promise<number> {
    return this.prisma.groupBroadcastTarget.count({
      where: { tenantId, broadcastId, status: 'PENDING' },
    });
  }

  async resetTargetsForNextRun(tenantId: string, broadcastId: string): Promise<number> {
    // `skipped` fica de fora de propósito: grupo só-admin ou do qual o número
    // saiu continua fora até o disparo ser recriado (ver o port).
    const { count } = await this.prisma.groupBroadcastTarget.updateMany({
      where: { tenantId, broadcastId, status: { in: ['SENT', 'FAILED'] } },
      data: { status: 'PENDING', errorMessage: null, attemptedAt: null },
    });
    return count;
  }

  async markRunFinished(
    tenantId: string,
    broadcastId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void> {
    await this.prisma.groupBroadcast.updateMany({
      where: { id: broadcastId, tenantId },
      data: { runsCompleted, nextRunAt },
    });
  }

  async updateStatus(
    tenantId: string,
    broadcastId: string,
    status: GroupBroadcastStatus,
    pausedReason?: string,
  ): Promise<GroupBroadcast | undefined> {
    const { count } = await this.prisma.groupBroadcast.updateMany({
      where: { id: broadcastId, tenantId },
      data: {
        status: STATUS_TO_PRISMA[status],
        // Só uma pausa guarda motivo — retomar/cancelar/concluir limpa o anterior.
        pausedReason: status === 'paused' ? (pausedReason ?? null) : null,
      },
    });
    if (count === 0) return undefined;
    return this.findById(tenantId, broadcastId);
  }

  async countRunningBySession(
    tenantId: string,
    sessionName: string,
    excludeBroadcastId?: string,
  ): Promise<number> {
    return this.prisma.groupBroadcast.count({
      where: {
        tenantId,
        sessionName,
        status: 'RUNNING',
        ...(excludeBroadcastId ? { id: { not: excludeBroadcastId } } : {}),
      },
    });
  }

  async deleteById(tenantId: string, broadcastId: string): Promise<boolean> {
    const { count } = await this.prisma.groupBroadcast.deleteMany({
      where: { id: broadcastId, tenantId },
    });
    return count > 0;
  }

  async attachMedia(
    tenantId: string,
    broadcastId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcast | undefined> {
    const { count } = await this.prisma.groupBroadcast.updateMany({
      where: { id: broadcastId, tenantId },
      data: {
        mediaContent: media.buffer,
        mediaMimeType: media.mimeType,
        mediaFileName: media.fileName ?? null,
        mediaContentType: MEDIA_TYPE_TO_PRISMA[media.contentType],
      },
    });
    if (count === 0) return undefined;
    return this.findById(tenantId, broadcastId);
  }

  async removeMedia(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined> {
    const { count } = await this.prisma.groupBroadcast.updateMany({
      where: { id: broadcastId, tenantId },
      data: {
        mediaContent: null,
        mediaMimeType: null,
        mediaFileName: null,
        mediaContentType: null,
      },
    });
    if (count === 0) return undefined;
    return this.findById(tenantId, broadcastId);
  }

  async getMediaContent(
    tenantId: string,
    broadcastId: string,
  ): Promise<GroupBroadcastMediaContent | undefined> {
    const row = await this.prisma.groupBroadcast.findFirst({
      where: { id: broadcastId, tenantId },
      select: {
        mediaContent: true,
        mediaMimeType: true,
        mediaFileName: true,
        mediaContentType: true,
      },
    });
    if (!row || !row.mediaContent || !row.mediaContentType) return undefined;
    const contentType = MEDIA_TYPE_FROM_PRISMA[row.mediaContentType];
    if (!contentType) return undefined;
    return {
      contentType,
      buffer: Buffer.from(row.mediaContent),
      mimeType: row.mediaMimeType ?? 'application/octet-stream',
      fileName: row.mediaFileName ?? undefined,
    };
  }
}
