import type {
  PrismaClient,
  CampaignStatus as PrismaCampaignStatus,
  GroupBroadcastTargetStatus as PrismaTargetStatus,
} from '@prisma/client';

import {
  GroupBroadcast,
  GroupBroadcastMediaContentType,
  GroupBroadcastStatus,
  GroupBroadcastStep,
  GroupBroadcastStepTarget,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
  GroupBroadcastTargetStatus,
} from '../../domain/entities/GroupBroadcast';
import {
  CreateGroupBroadcastData,
  CreateGroupBroadcastStepData,
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
 * `select` EXPLÍCITO — nenhum campo de mídia (não há mais nenhum na campanha,
 * 2026-09-14 — mídia agora é por etapa). Mesma decisão de sempre: nunca
 * confiar em "todas as colunas" numa entidade que pode crescer.
 */
const GROUP_BROADCAST_SELECT = {
  id: true,
  tenantId: true,
  sessionName: true,
  name: true,
  status: true,
  intervalSeconds: true,
  sendWindowStart: true,
  sendWindowEnd: true,
  stepLaunchOffsetMinutes: true,
  pausedReason: true,
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface GroupBroadcastRow {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  status: string;
  intervalSeconds: number;
  sendWindowStart: string | null;
  sendWindowEnd: string | null;
  stepLaunchOffsetMinutes: number | null;
  pausedReason: string | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * `select` da etapa — o binário (até 16MB num vídeo) nunca pode entrar numa
 * resposta JSON de lista/detalhe; só `getStepMediaContent` o lê. Mesma
 * decisão e mesma razão de `GROUP_BROADCAST_SELECT`/`CAMPAIGN_SELECT`.
 */
const GROUP_BROADCAST_STEP_SELECT = {
  id: true,
  tenantId: true,
  broadcastId: true,
  order: true,
  messageTemplate: true,
  mediaMimeType: true,
  mediaFileName: true,
  mediaContentType: true,
  recurrenceIntervalHours: true,
  recurrenceMaxRuns: true,
  recurrenceEndsAt: true,
  runsCompleted: true,
  nextRunAt: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
} as const;

interface GroupBroadcastStepRow {
  id: string;
  tenantId: string;
  broadcastId: string;
  order: number;
  messageTemplate: string;
  mediaMimeType: string | null;
  mediaFileName: string | null;
  mediaContentType: string | null;
  recurrenceIntervalHours: number | null;
  recurrenceMaxRuns: number | null;
  recurrenceEndsAt: Date | null;
  runsCompleted: number;
  nextRunAt: Date | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}

interface GroupBroadcastTargetRow {
  id: string;
  tenantId: string;
  broadcastId: string;
  groupJid: string;
  groupName: string;
  status: string;
  skipReason: string | null;
  createdAt: Date;
}

/** Linha de `GroupBroadcastStepTarget` já com `groupJid`/`groupName`/`skipReason` resolvidos via `include`. */
interface GroupBroadcastStepTargetRow {
  id: string;
  tenantId: string;
  broadcastId: string;
  stepId: string;
  targetId: string;
  status: string;
  errorMessage: string | null;
  sentAt: Date | null;
  attemptedAt: Date | null;
  sentCount: number;
  createdAt: Date;
  target: { groupJid: string; groupName: string; skipReason: string | null };
}

function toDomain(row: GroupBroadcastRow): GroupBroadcast {
  return {
    id: row.id,
    tenantId: row.tenantId,
    sessionName: row.sessionName,
    name: row.name,
    status: STATUS_FROM_PRISMA[row.status] ?? 'draft',
    intervalSeconds: row.intervalSeconds,
    sendWindowStart: row.sendWindowStart ?? undefined,
    sendWindowEnd: row.sendWindowEnd ?? undefined,
    stepLaunchOffsetMinutes: row.stepLaunchOffsetMinutes ?? undefined,
    pausedReason: row.pausedReason ?? undefined,
    createdByUserId: row.createdByUserId ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function stepToDomain(row: GroupBroadcastStepRow): GroupBroadcastStep {
  const mediaContentType = row.mediaContentType
    ? MEDIA_TYPE_FROM_PRISMA[row.mediaContentType]
    : undefined;
  return {
    id: row.id,
    tenantId: row.tenantId,
    broadcastId: row.broadcastId,
    order: row.order,
    messageTemplate: row.messageTemplate,
    media: mediaContentType
      ? {
          contentType: mediaContentType,
          mimeType: row.mediaMimeType ?? 'application/octet-stream',
          fileName: row.mediaFileName ?? undefined,
        }
      : undefined,
    recurrenceIntervalHours: row.recurrenceIntervalHours ?? undefined,
    recurrenceMaxRuns: row.recurrenceMaxRuns ?? undefined,
    recurrenceEndsAt: row.recurrenceEndsAt ?? undefined,
    runsCompleted: row.runsCompleted,
    nextRunAt: row.nextRunAt ?? undefined,
    startedAt: row.startedAt ?? undefined,
    finishedAt: row.finishedAt ?? undefined,
    createdAt: row.createdAt,
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
    createdAt: row.createdAt,
  };
}

function stepTargetToDomain(row: GroupBroadcastStepTargetRow): GroupBroadcastStepTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    broadcastId: row.broadcastId,
    stepId: row.stepId,
    targetId: row.targetId,
    groupJid: row.target.groupJid,
    groupName: row.target.groupName,
    status: TARGET_STATUS_FROM_PRISMA[row.status] ?? 'pending',
    skipReason: row.target.skipReason ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    sentAt: row.sentAt ?? undefined,
    attemptedAt: row.attemptedAt ?? undefined,
    sentCount: row.sentCount,
    createdAt: row.createdAt,
  };
}

function emptySummary(): GroupBroadcastSummary {
  return { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0, totalSent: 0 };
}

function addToSummary(summary: GroupBroadcastSummary, status: string, count: number): void {
  const key = TARGET_STATUS_FROM_PRISMA[status];
  if (!key) return;
  summary[key] += count;
  summary.total += count;
}

const STEP_TARGET_INCLUDE = {
  target: { select: { groupJid: true, groupName: true, skipReason: true } },
} as const;

/** Implementação Postgres de `GroupBroadcastRepository` — toda consulta escopada por `tenantId`. */
export class PrismaGroupBroadcastRepository implements GroupBroadcastRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateGroupBroadcastData): Promise<GroupBroadcast> {
    const row = await this.prisma.groupBroadcast.create({
      data: {
        tenantId: data.tenantId,
        sessionName: data.sessionName,
        name: data.name,
        intervalSeconds: data.intervalSeconds,
        sendWindowStart: data.sendWindowStart ?? null,
        sendWindowEnd: data.sendWindowEnd ?? null,
        stepLaunchOffsetMinutes: data.stepLaunchOffsetMinutes ?? null,
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

  async createSteps(
    tenantId: string,
    broadcastId: string,
    steps: CreateGroupBroadcastStepData[],
  ): Promise<GroupBroadcastStep[]> {
    if (steps.length === 0) return [];
    await this.prisma.groupBroadcastStep.createMany({
      data: steps.map((step) => ({
        tenantId,
        broadcastId,
        order: step.order,
        messageTemplate: step.messageTemplate,
        recurrenceIntervalHours: step.recurrenceIntervalHours ?? null,
        recurrenceMaxRuns: step.recurrenceMaxRuns ?? null,
        recurrenceEndsAt: step.recurrenceEndsAt ?? null,
      })),
    });
    return this.listSteps(tenantId, broadcastId);
  }

  async listSteps(tenantId: string, broadcastId: string): Promise<GroupBroadcastStep[]> {
    const rows = await this.prisma.groupBroadcastStep.findMany({
      where: { tenantId, broadcastId },
      orderBy: { order: 'asc' },
      select: GROUP_BROADCAST_STEP_SELECT,
    });
    return rows.map(stepToDomain);
  }

  async findStepById(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const row = await this.prisma.groupBroadcastStep.findFirst({
      where: { id: stepId, tenantId },
      select: GROUP_BROADCAST_STEP_SELECT,
    });
    return row ? stepToDomain(row) : undefined;
  }

  /**
   * Materializa o progresso de TODAS as etapas × TODOS os alvos de uma vez —
   * um `GroupBroadcastStepTarget` por par, espelhando a elegibilidade
   * (`pending`/`skipped`) já decidida em `GroupBroadcastTarget`. Chamado uma
   * única vez, logo após `createSteps`/`createTargets`.
   */
  async initializeStepTargets(tenantId: string, broadcastId: string): Promise<void> {
    const [steps, targets] = await Promise.all([
      this.prisma.groupBroadcastStep.findMany({
        where: { tenantId, broadcastId },
        select: { id: true },
      }),
      this.prisma.groupBroadcastTarget.findMany({
        where: { tenantId, broadcastId },
        select: { id: true, status: true },
      }),
    ]);
    if (steps.length === 0 || targets.length === 0) return;
    const rows = steps.flatMap((step) =>
      targets.map((target) => ({
        tenantId,
        broadcastId,
        stepId: step.id,
        targetId: target.id,
        status: target.status,
      })),
    );
    await this.prisma.groupBroadcastStepTarget.createMany({ data: rows, skipDuplicates: true });
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

  async listStepTargets(tenantId: string, stepId: string): Promise<GroupBroadcastStepTarget[]> {
    const rows = await this.prisma.groupBroadcastStepTarget.findMany({
      where: { tenantId, stepId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: STEP_TARGET_INCLUDE,
    });
    return rows.map(stepTargetToDomain);
  }

  async findStepTargetById(
    tenantId: string,
    stepTargetId: string,
  ): Promise<GroupBroadcastStepTarget | undefined> {
    const row = await this.prisma.groupBroadcastStepTarget.findFirst({
      where: { id: stepTargetId, tenantId },
      include: STEP_TARGET_INCLUDE,
    });
    return row ? stepTargetToDomain(row) : undefined;
  }

  async listPendingStepTargets(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastStepTarget[]> {
    const rows = await this.prisma.groupBroadcastStepTarget.findMany({
      where: { tenantId, stepId, status: 'PENDING' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: STEP_TARGET_INCLUDE,
    });
    return rows.map(stepTargetToDomain);
  }

  async summarizeTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastSummary> {
    const [groups, sentCountAgg, skippedCount, totalCount] = await Promise.all([
      this.prisma.groupBroadcastStepTarget.groupBy({
        by: ['status'],
        where: { tenantId, broadcastId },
        _count: { _all: true },
      }),
      this.prisma.groupBroadcastStepTarget.aggregate({
        where: { tenantId, broadcastId },
        _sum: { sentCount: true },
      }),
      this.prisma.groupBroadcastTarget.count({ where: { tenantId, broadcastId, status: 'SKIPPED' } }),
      this.prisma.groupBroadcastTarget.count({ where: { tenantId, broadcastId } }),
    ]);
    const summary = emptySummary();
    for (const group of groups) {
      // `skipped` vem da elegibilidade (campanha-wide), não somado por etapa
      // — senão um disparo de 4 etapas contaria cada grupo suprimido 4 vezes.
      if (group.status === 'SKIPPED') continue;
      addToSummary(summary, group.status, group._count._all);
    }
    summary.totalSent = sentCountAgg._sum.sentCount ?? 0;
    summary.skipped = skippedCount;
    summary.total = totalCount;
    return summary;
  }

  async summarizeTargetsForBroadcasts(
    tenantId: string,
    broadcastIds: string[],
  ): Promise<Map<string, GroupBroadcastSummary>> {
    const result = new Map<string, GroupBroadcastSummary>();
    if (broadcastIds.length === 0) return result;
    const [groups, sentCountGroups, skippedGroups, totalGroups] = await Promise.all([
      this.prisma.groupBroadcastStepTarget.groupBy({
        by: ['broadcastId', 'status'],
        where: { tenantId, broadcastId: { in: broadcastIds } },
        _count: { _all: true },
      }),
      this.prisma.groupBroadcastStepTarget.groupBy({
        by: ['broadcastId'],
        where: { tenantId, broadcastId: { in: broadcastIds } },
        _sum: { sentCount: true },
      }),
      this.prisma.groupBroadcastTarget.groupBy({
        by: ['broadcastId'],
        where: { tenantId, broadcastId: { in: broadcastIds }, status: 'SKIPPED' },
        _count: { _all: true },
      }),
      this.prisma.groupBroadcastTarget.groupBy({
        by: ['broadcastId'],
        where: { tenantId, broadcastId: { in: broadcastIds } },
        _count: { _all: true },
      }),
    ]);
    for (const group of groups) {
      if (group.status === 'SKIPPED') continue;
      const summary = result.get(group.broadcastId) ?? emptySummary();
      addToSummary(summary, group.status, group._count._all);
      result.set(group.broadcastId, summary);
    }
    for (const group of sentCountGroups) {
      const summary = result.get(group.broadcastId) ?? emptySummary();
      summary.totalSent = group._sum.sentCount ?? 0;
      result.set(group.broadcastId, summary);
    }
    for (const group of skippedGroups) {
      const summary = result.get(group.broadcastId) ?? emptySummary();
      summary.skipped = group._count._all;
      result.set(group.broadcastId, summary);
    }
    for (const group of totalGroups) {
      const summary = result.get(group.broadcastId) ?? emptySummary();
      summary.total = group._count._all;
      result.set(group.broadcastId, summary);
    }
    return result;
  }

  async summarizeStepTargets(tenantId: string, stepId: string): Promise<GroupBroadcastSummary> {
    const [groups, sentCountAgg] = await Promise.all([
      this.prisma.groupBroadcastStepTarget.groupBy({
        by: ['status'],
        where: { tenantId, stepId },
        _count: { _all: true },
      }),
      this.prisma.groupBroadcastStepTarget.aggregate({
        where: { tenantId, stepId },
        _sum: { sentCount: true },
      }),
    ]);
    const summary = emptySummary();
    for (const group of groups) {
      addToSummary(summary, group.status, group._count._all);
    }
    summary.totalSent = sentCountAgg._sum.sentCount ?? 0;
    return summary;
  }

  async markStepTargetSent(
    tenantId: string,
    stepTargetId: string,
    attemptedAt: Date,
  ): Promise<void> {
    await this.prisma.groupBroadcastStepTarget.updateMany({
      where: { id: stepTargetId, tenantId, status: 'PENDING' },
      data: {
        status: 'SENT',
        sentAt: attemptedAt,
        attemptedAt,
        errorMessage: null,
        sentCount: { increment: 1 },
      },
    });
  }

  async markStepTargetFailed(
    tenantId: string,
    stepTargetId: string,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void> {
    await this.prisma.groupBroadcastStepTarget.updateMany({
      where: { id: stepTargetId, tenantId, status: 'PENDING' },
      data: { status: 'FAILED', attemptedAt, errorMessage },
    });
  }

  async listRecentOutcomes(
    tenantId: string,
    broadcastId: string,
    limit: number,
  ): Promise<Array<'sent' | 'failed'>> {
    const rows = await this.prisma.groupBroadcastStepTarget.findMany({
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

  async countPendingStepTargets(tenantId: string, stepId: string): Promise<number> {
    return this.prisma.groupBroadcastStepTarget.count({
      where: { tenantId, stepId, status: 'PENDING' },
    });
  }

  async resetStepTargetsForNextRun(tenantId: string, stepId: string): Promise<number> {
    // `skipped` fica de fora de propósito: grupo só-admin ou do qual o número
    // saiu continua fora até o disparo ser recriado (ver o port).
    const { count } = await this.prisma.groupBroadcastStepTarget.updateMany({
      where: { tenantId, stepId, status: { in: ['SENT', 'FAILED'] } },
      data: { status: 'PENDING', errorMessage: null, attemptedAt: null },
    });
    return count;
  }

  async markStepRunFinished(
    tenantId: string,
    stepId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void> {
    await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: { runsCompleted, nextRunAt },
    });
  }

  async markStepFinished(tenantId: string, stepId: string, runsCompleted: number): Promise<void> {
    await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: { runsCompleted, nextRunAt: null, finishedAt: new Date() },
    });
  }

  async areAllStepsFinished(tenantId: string, broadcastId: string): Promise<boolean> {
    const pendingCount = await this.prisma.groupBroadcastStep.count({
      where: { tenantId, broadcastId, finishedAt: null },
    });
    return pendingCount === 0;
  }

  async markStepStarted(tenantId: string, stepId: string, startedAt: Date): Promise<void> {
    // `startedAt: null` no `where` — idempotente: uma 2ª chamada (ex.: retry)
    // nunca reescreve o timestamp original.
    await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId, startedAt: null },
      data: { startedAt },
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

  async attachStepMedia(
    tenantId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep | undefined> {
    const { count } = await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: {
        mediaContent: media.buffer,
        mediaMimeType: media.mimeType,
        mediaFileName: media.fileName ?? null,
        mediaContentType: MEDIA_TYPE_TO_PRISMA[media.contentType],
      },
    });
    if (count === 0) return undefined;
    return this.findStepById(tenantId, stepId);
  }

  async removeStepMedia(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const { count } = await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: { mediaContent: null, mediaMimeType: null, mediaFileName: null, mediaContentType: null },
    });
    if (count === 0) return undefined;
    return this.findStepById(tenantId, stepId);
  }

  async getStepMediaContent(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastMediaContent | undefined> {
    const row = await this.prisma.groupBroadcastStep.findFirst({
      where: { id: stepId, tenantId },
      select: { mediaContent: true, mediaMimeType: true, mediaFileName: true, mediaContentType: true },
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

  async updateBroadcastSettings(
    tenantId: string,
    broadcastId: string,
    data: {
      name: string;
      intervalSeconds: number;
      sendWindowStart?: string;
      sendWindowEnd?: string;
      stepLaunchOffsetMinutes?: number;
    },
  ): Promise<GroupBroadcast | undefined> {
    // SUBSTITUI por completo — o cliente sempre envia o estado final
    // desejado, então um campo ausente vira `null` (mesma semântica de
    // `create`), nunca "deixa como estava".
    const { count } = await this.prisma.groupBroadcast.updateMany({
      where: { id: broadcastId, tenantId },
      data: {
        name: data.name,
        intervalSeconds: data.intervalSeconds,
        sendWindowStart: data.sendWindowStart ?? null,
        sendWindowEnd: data.sendWindowEnd ?? null,
        stepLaunchOffsetMinutes: data.stepLaunchOffsetMinutes ?? null,
      },
    });
    if (count === 0) return undefined;
    return this.findById(tenantId, broadcastId);
  }

  async updateStep(
    tenantId: string,
    stepId: string,
    data: {
      messageTemplate: string;
      recurrenceIntervalHours?: number;
      recurrenceMaxRuns?: number;
      recurrenceEndsAt?: Date;
    },
  ): Promise<GroupBroadcastStep | undefined> {
    // Nunca toca `order` (jamais reatribuída) nem `runsCompleted`/`nextRunAt`/
    // `startedAt`/`finishedAt` — histórico de execução, intocado pela edição.
    const { count } = await this.prisma.groupBroadcastStep.updateMany({
      where: { id: stepId, tenantId },
      data: {
        messageTemplate: data.messageTemplate,
        recurrenceIntervalHours: data.recurrenceIntervalHours ?? null,
        recurrenceMaxRuns: data.recurrenceMaxRuns ?? null,
        recurrenceEndsAt: data.recurrenceEndsAt ?? null,
      },
    });
    if (count === 0) return undefined;
    return this.findStepById(tenantId, stepId);
  }

  async deleteSteps(tenantId: string, stepIds: string[]): Promise<number> {
    if (stepIds.length === 0) return 0;
    // `onDelete: Cascade` em `GroupBroadcastStepTarget.step` limpa o
    // progresso daquela etapa sozinho — nunca chamado para etapa com
    // histórico (essa é encerrada via `markStepFinished`, nunca apagada).
    const { count } = await this.prisma.groupBroadcastStep.deleteMany({
      where: { id: { in: stepIds }, tenantId },
    });
    return count;
  }

  async deleteTargets(tenantId: string, targetIds: string[]): Promise<number> {
    if (targetIds.length === 0) return 0;
    // `onDelete: Cascade` em `GroupBroadcastStepTarget.target` limpa o
    // progresso daquele grupo em toda etapa — só chamado para grupo SEM
    // histórico (com histórico, é `suppressTargets`, nunca `deleteTargets`).
    const { count } = await this.prisma.groupBroadcastTarget.deleteMany({
      where: { id: { in: targetIds }, tenantId },
    });
    return count;
  }

  async suppressTargets(
    tenantId: string,
    targetIds: string[],
    skipReason: string,
  ): Promise<number> {
    if (targetIds.length === 0) return 0;
    // As DUAS escritas (alvo + progresso de cada etapa) precisam acontecer
    // juntas — se marcar só uma, a próxima repetição republica no grupo que
    // deveria ter sido removido. `sentCount` é preservado nas duas tabelas:
    // o relatório que o operador manda ao cliente continua verdadeiro.
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.groupBroadcastTarget.updateMany({
        where: { id: { in: targetIds }, tenantId },
        data: { status: 'SKIPPED', skipReason },
      }),
      this.prisma.groupBroadcastStepTarget.updateMany({
        where: { targetId: { in: targetIds }, tenantId },
        data: { status: 'SKIPPED' },
      }),
    ]);
    return count;
  }

  async reopenTargets(tenantId: string, targetIds: string[]): Promise<number> {
    if (targetIds.length === 0) return 0;
    // Simétrico a `suppressTargets` — as DUAS escritas juntas, mesma
    // transação. `sentCount` nunca é tocado (histórico de publicações
    // passadas, não do ciclo atual).
    const [{ count }] = await this.prisma.$transaction([
      this.prisma.groupBroadcastTarget.updateMany({
        where: { id: { in: targetIds }, tenantId },
        data: { status: 'PENDING', skipReason: null },
      }),
      this.prisma.groupBroadcastStepTarget.updateMany({
        where: { targetId: { in: targetIds }, tenantId },
        data: { status: 'PENDING' },
      }),
    ]);
    return count;
  }

  async countStepTargetsWithHistory(
    tenantId: string,
    broadcastId: string,
  ): Promise<Map<string, number>> {
    // Agregação no banco (`groupBy` + `_sum`) — nunca carrega linha a linha
    // para somar em JavaScript.
    const groups = await this.prisma.groupBroadcastStepTarget.groupBy({
      by: ['targetId'],
      where: { tenantId, broadcastId },
      _sum: { sentCount: true },
    });
    const result = new Map<string, number>();
    for (const group of groups) {
      result.set(group.targetId, group._sum.sentCount ?? 0);
    }
    return result;
  }
}
