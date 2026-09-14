import {
  GroupBroadcast,
  GroupBroadcastStatus,
  GroupBroadcastStep,
  GroupBroadcastStepTarget,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
} from '../../../src/services/groupBroadcasts/domain/entities/GroupBroadcast';
import {
  CreateGroupBroadcastData,
  CreateGroupBroadcastStepData,
  GroupBroadcastMediaContent,
  GroupBroadcastRepository,
  GroupBroadcastTargetDraft,
} from '../../../src/services/groupBroadcasts/domain/repositories/GroupBroadcastRepository';
import {
  GroupDirectory,
  GroupDirectoryEntry,
} from '../../../src/services/groupBroadcasts/domain/providers/GroupDirectory';
import {
  GroupMessageSender,
  GroupMessageSendResult,
  GroupSendMedia,
} from '../../../src/services/groupBroadcasts/domain/providers/GroupMessageSender';
import { GroupBroadcastSendDispatcher } from '../../../src/services/groupBroadcasts/domain/dispatchers/GroupBroadcastSendDispatcher';
import { AuditLogRepository, NewAuditLog, AuditLogPage } from '../../../src/services/auth/domain/repositories/AuditLogRepository';
import { AuditLog } from '../../../src/services/auth/domain/entities/AuditLog';

/** Linha interna de progresso — o mapa público (`GroupBroadcastStepTarget`) resolve `groupJid`/`groupName` a partir do `targetId`. */
interface StepTargetRow {
  id: string;
  tenantId: string;
  broadcastId: string;
  stepId: string;
  targetId: string;
  status: GroupBroadcastTarget['status'];
  errorMessage?: string;
  sentAt?: Date;
  attemptedAt?: Date;
  sentCount: number;
  createdAt: Date;
}

/**
 * Test doubles do bounded context `groupBroadcasts` (Disparos em grupos,
 * 2026-09-11), estendido em 2026-09-14 para etapas em PARALELO ("cadência
 * entre publicações"). Em memória, mesma disciplina de `FakeCampaignRepository`:
 * toda operação filtra por `tenantId`, então os testes de IDOR são reais.
 */
export class FakeGroupBroadcastRepository implements GroupBroadcastRepository {
  private broadcasts = new Map<string, GroupBroadcast>();
  private targets = new Map<string, GroupBroadcastTarget>();
  private steps = new Map<string, GroupBroadcastStep>();
  private stepTargets = new Map<string, StepTargetRow>();
  private stepMedia = new Map<string, GroupBroadcastMediaContent>();
  private sequence = 0;

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  private stepTargetToDomain(row: StepTargetRow): GroupBroadcastStepTarget {
    const target = this.targets.get(row.targetId);
    return {
      id: row.id,
      tenantId: row.tenantId,
      broadcastId: row.broadcastId,
      stepId: row.stepId,
      targetId: row.targetId,
      groupJid: target?.groupJid ?? '',
      groupName: target?.groupName ?? '',
      skipReason: target?.skipReason,
      status: row.status,
      errorMessage: row.errorMessage,
      sentAt: row.sentAt,
      attemptedAt: row.attemptedAt,
      sentCount: row.sentCount,
      createdAt: row.createdAt,
    };
  }

  async create(data: CreateGroupBroadcastData): Promise<GroupBroadcast> {
    const now = new Date(Date.now() + this.sequence);
    const broadcast: GroupBroadcast = {
      id: this.nextId('broadcast'),
      tenantId: data.tenantId,
      sessionName: data.sessionName,
      name: data.name,
      status: 'draft',
      intervalSeconds: data.intervalSeconds,
      sendWindowStart: data.sendWindowStart,
      sendWindowEnd: data.sendWindowEnd,
      stepLaunchOffsetMinutes: data.stepLaunchOffsetMinutes,
      createdByUserId: data.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.broadcasts.set(broadcast.id, broadcast);
    return { ...broadcast };
  }

  async createSteps(
    tenantId: string,
    broadcastId: string,
    steps: CreateGroupBroadcastStepData[],
  ): Promise<GroupBroadcastStep[]> {
    for (const step of steps) {
      const id = this.nextId('step');
      this.steps.set(id, {
        id,
        tenantId,
        broadcastId,
        order: step.order,
        messageTemplate: step.messageTemplate,
        recurrenceIntervalHours: step.recurrenceIntervalHours,
        recurrenceMaxRuns: step.recurrenceMaxRuns,
        recurrenceEndsAt: step.recurrenceEndsAt,
        runsCompleted: 0,
        createdAt: new Date(Date.now() + this.sequence),
      });
    }
    return this.listSteps(tenantId, broadcastId);
  }

  async listSteps(tenantId: string, broadcastId: string): Promise<GroupBroadcastStep[]> {
    return Array.from(this.steps.values())
      .filter((s) => s.tenantId === tenantId && s.broadcastId === broadcastId)
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ ...s }));
  }

  async findStepById(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const step = this.steps.get(stepId);
    return step && step.tenantId === tenantId ? { ...step } : undefined;
  }

  async initializeStepTargets(tenantId: string, broadcastId: string): Promise<void> {
    const steps = await this.listSteps(tenantId, broadcastId);
    const targets = await this.listTargets(tenantId, broadcastId);
    for (const step of steps) {
      for (const target of targets) {
        const exists = Array.from(this.stepTargets.values()).some(
          (row) => row.stepId === step.id && row.targetId === target.id,
        );
        if (exists) continue;
        const id = this.nextId('step-target');
        this.stepTargets.set(id, {
          id,
          tenantId,
          broadcastId,
          stepId: step.id,
          targetId: target.id,
          status: target.status,
          sentCount: 0,
          createdAt: new Date(Date.now() + this.sequence),
        });
      }
    }
  }

  async markStepRunFinished(
    tenantId: string,
    stepId: string,
    runsCompleted: number,
    nextRunAt: Date | null,
  ): Promise<void> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return;
    this.steps.set(stepId, { ...step, runsCompleted, nextRunAt: nextRunAt ?? undefined });
  }

  async markStepFinished(tenantId: string, stepId: string, runsCompleted: number): Promise<void> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return;
    this.steps.set(stepId, {
      ...step,
      runsCompleted,
      nextRunAt: undefined,
      finishedAt: new Date(Date.now() + this.sequence),
    });
  }

  async areAllStepsFinished(tenantId: string, broadcastId: string): Promise<boolean> {
    const steps = await this.listSteps(tenantId, broadcastId);
    return steps.length > 0 && steps.every((step) => step.finishedAt);
  }

  async markStepStarted(tenantId: string, stepId: string, startedAt: Date): Promise<void> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId || step.startedAt) return;
    this.steps.set(stepId, { ...step, startedAt });
  }

  async attachStepMedia(
    tenantId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep | undefined> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return undefined;
    this.stepMedia.set(stepId, media);
    const updated: GroupBroadcastStep = {
      ...step,
      media: { contentType: media.contentType, mimeType: media.mimeType, fileName: media.fileName },
    };
    this.steps.set(stepId, updated);
    return { ...updated };
  }

  async removeStepMedia(tenantId: string, stepId: string): Promise<GroupBroadcastStep | undefined> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return undefined;
    this.stepMedia.delete(stepId);
    const updated: GroupBroadcastStep = { ...step, media: undefined };
    this.steps.set(stepId, updated);
    return { ...updated };
  }

  async getStepMediaContent(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastMediaContent | undefined> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return undefined;
    return this.stepMedia.get(stepId);
  }

  async createTargets(
    tenantId: string,
    broadcastId: string,
    drafts: GroupBroadcastTargetDraft[],
  ): Promise<void> {
    for (const draft of drafts) {
      const duplicate = Array.from(this.targets.values()).some(
        (target) => target.broadcastId === broadcastId && target.groupJid === draft.groupJid,
      );
      if (duplicate) continue;
      const target: GroupBroadcastTarget = {
        id: this.nextId('target'),
        tenantId,
        broadcastId,
        groupJid: draft.groupJid,
        groupName: draft.groupName,
        status: draft.status,
        skipReason: draft.skipReason,
        createdAt: new Date(Date.now() + this.sequence),
      };
      this.targets.set(target.id, target);
    }
  }

  async findById(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined> {
    const broadcast = this.broadcasts.get(broadcastId);
    return broadcast && broadcast.tenantId === tenantId ? { ...broadcast } : undefined;
  }

  async listBySession(
    tenantId: string,
    sessionName: string,
    limit: number,
  ): Promise<GroupBroadcast[]> {
    return Array.from(this.broadcasts.values())
      .filter((b) => b.tenantId === tenantId && b.sessionName === sessionName)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((b) => ({ ...b }));
  }

  async listTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastTarget[]> {
    return Array.from(this.targets.values())
      .filter((t) => t.tenantId === tenantId && t.broadcastId === broadcastId)
      .map((t) => ({ ...t }));
  }

  async listStepTargets(tenantId: string, stepId: string): Promise<GroupBroadcastStepTarget[]> {
    return Array.from(this.stepTargets.values())
      .filter((row) => row.tenantId === tenantId && row.stepId === stepId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((row) => this.stepTargetToDomain(row));
  }

  async findStepTargetById(
    tenantId: string,
    stepTargetId: string,
  ): Promise<GroupBroadcastStepTarget | undefined> {
    const row = this.stepTargets.get(stepTargetId);
    return row && row.tenantId === tenantId ? this.stepTargetToDomain(row) : undefined;
  }

  async listPendingStepTargets(
    tenantId: string,
    stepId: string,
  ): Promise<GroupBroadcastStepTarget[]> {
    return (await this.listStepTargets(tenantId, stepId)).filter((t) => t.status === 'pending');
  }

  async summarizeTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastSummary> {
    const summary: GroupBroadcastSummary = {
      total: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      totalSent: 0,
    };
    const targets = await this.listTargets(tenantId, broadcastId);
    summary.total = targets.length;
    summary.skipped = targets.filter((t) => t.status === 'skipped').length;
    for (const row of Array.from(this.stepTargets.values())) {
      if (row.tenantId !== tenantId || row.broadcastId !== broadcastId) continue;
      if (row.status === 'skipped') continue;
      summary[row.status] += 1;
      summary.totalSent += row.sentCount;
    }
    return summary;
  }

  async summarizeTargetsForBroadcasts(
    tenantId: string,
    broadcastIds: string[],
  ): Promise<Map<string, GroupBroadcastSummary>> {
    const result = new Map<string, GroupBroadcastSummary>();
    for (const id of broadcastIds) {
      const summary = await this.summarizeTargets(tenantId, id);
      if (summary.total > 0) result.set(id, summary);
    }
    return result;
  }

  async summarizeStepTargets(tenantId: string, stepId: string): Promise<GroupBroadcastSummary> {
    const summary: GroupBroadcastSummary = {
      total: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      totalSent: 0,
    };
    for (const row of await this.listStepTargets(tenantId, stepId)) {
      summary[row.status] += 1;
      summary.total += 1;
      summary.totalSent += row.sentCount;
    }
    return summary;
  }

  async markStepTargetSent(
    tenantId: string,
    stepTargetId: string,
    attemptedAt: Date,
  ): Promise<void> {
    const row = this.stepTargets.get(stepTargetId);
    if (!row || row.tenantId !== tenantId || row.status !== 'pending') return;
    this.stepTargets.set(stepTargetId, {
      ...row,
      status: 'sent',
      sentAt: attemptedAt,
      attemptedAt,
      errorMessage: undefined,
      sentCount: row.sentCount + 1,
    });
  }

  async markStepTargetFailed(
    tenantId: string,
    stepTargetId: string,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void> {
    const row = this.stepTargets.get(stepTargetId);
    if (!row || row.tenantId !== tenantId || row.status !== 'pending') return;
    this.stepTargets.set(stepTargetId, { ...row, status: 'failed', attemptedAt, errorMessage });
  }

  async listRecentOutcomes(
    tenantId: string,
    broadcastId: string,
    limit: number,
  ): Promise<Array<'sent' | 'failed'>> {
    return Array.from(this.stepTargets.values())
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.broadcastId === broadcastId &&
          row.attemptedAt &&
          (row.status === 'sent' || row.status === 'failed'),
      )
      .sort((a, b) => (b.attemptedAt?.getTime() ?? 0) - (a.attemptedAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((row) => (row.status === 'sent' ? 'sent' : 'failed'));
  }

  async resetStepTargetsForNextRun(tenantId: string, stepId: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.stepTargets) {
      if (row.tenantId !== tenantId || row.stepId !== stepId) continue;
      if (row.status !== 'sent' && row.status !== 'failed') continue;
      this.stepTargets.set(id, {
        ...row,
        status: 'pending',
        errorMessage: undefined,
        attemptedAt: undefined,
      });
      count += 1;
    }
    return count;
  }

  async countPendingStepTargets(tenantId: string, stepId: string): Promise<number> {
    return (await this.listPendingStepTargets(tenantId, stepId)).length;
  }

  async updateStatus(
    tenantId: string,
    broadcastId: string,
    status: GroupBroadcastStatus,
    pausedReason?: string,
  ): Promise<GroupBroadcast | undefined> {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast || broadcast.tenantId !== tenantId) return undefined;
    const updated: GroupBroadcast = {
      ...broadcast,
      status,
      pausedReason: status === 'paused' ? pausedReason : undefined,
      updatedAt: new Date(),
    };
    this.broadcasts.set(broadcastId, updated);
    return { ...updated };
  }

  async countRunningBySession(
    tenantId: string,
    sessionName: string,
    excludeBroadcastId?: string,
  ): Promise<number> {
    return Array.from(this.broadcasts.values()).filter(
      (b) =>
        b.tenantId === tenantId &&
        b.sessionName === sessionName &&
        b.status === 'running' &&
        b.id !== excludeBroadcastId,
    ).length;
  }

  async deleteById(tenantId: string, broadcastId: string): Promise<boolean> {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast || broadcast.tenantId !== tenantId) return false;
    this.broadcasts.delete(broadcastId);
    for (const [id, target] of this.targets) {
      if (target.broadcastId === broadcastId) this.targets.delete(id);
    }
    for (const [id, row] of this.stepTargets) {
      if (row.broadcastId === broadcastId) this.stepTargets.delete(id);
    }
    for (const [id, step] of this.steps) {
      if (step.broadcastId === broadcastId) {
        this.steps.delete(id);
        this.stepMedia.delete(id);
      }
    }
    return true;
  }

  /**
   * Helper de teste: cria um disparo já num status específico, com 1 etapa
   * (+ `extraSteps` opcionais) e alvos `pending` — já com o progresso por
   * etapa (`GroupBroadcastStepTarget`) inicializado, mesmo passo que
   * `initializeStepTargets` faz na criação real.
   */
  seedBroadcast(input: {
    tenantId: string;
    sessionName?: string;
    status?: GroupBroadcastStatus;
    intervalSeconds?: number;
    stepLaunchOffsetMinutes?: number;
    groupJids?: string[];
    messageTemplate?: string;
    recurrenceIntervalHours?: number;
    recurrenceMaxRuns?: number;
    recurrenceEndsAt?: Date;
    sendWindowStart?: string;
    sendWindowEnd?: string;
    runsCompleted?: number;
    /** Simula uma etapa JÁ iniciada antes (não é mais o "1º start") — ex.: testar retomada após pausa. */
    startedAt?: Date;
    /** Etapas EXTRAS além da etapa 0 (default) — para testar etapas em paralelo. */
    extraSteps?: Array<{
      messageTemplate: string;
      recurrenceIntervalHours?: number;
      recurrenceMaxRuns?: number;
      recurrenceEndsAt?: Date;
    }>;
  }): {
    broadcastId: string;
    targetIds: string[];
    stepIds: string[];
    /** `stepTargetIds[stepIndex][targetIndex]` — id do progresso daquele grupo naquela etapa. */
    stepTargetIds: string[][];
  } {
    const now = new Date(Date.now() + this.sequence);
    const id = this.nextId('broadcast');
    this.broadcasts.set(id, {
      id,
      tenantId: input.tenantId,
      sessionName: input.sessionName ?? 'sessao',
      name: 'Disparo',
      status: input.status ?? 'draft',
      intervalSeconds: input.intervalSeconds ?? 60,
      sendWindowStart: input.sendWindowStart,
      sendWindowEnd: input.sendWindowEnd,
      stepLaunchOffsetMinutes: input.stepLaunchOffsetMinutes,
      createdAt: now,
      updatedAt: now,
    });

    const stepIds: string[] = [];
    const firstStepId = this.nextId('step');
    this.steps.set(firstStepId, {
      id: firstStepId,
      tenantId: input.tenantId,
      broadcastId: id,
      order: 0,
      messageTemplate: input.messageTemplate ?? 'Promoção!',
      recurrenceIntervalHours: input.recurrenceIntervalHours,
      recurrenceMaxRuns: input.recurrenceMaxRuns,
      recurrenceEndsAt: input.recurrenceEndsAt,
      runsCompleted: input.runsCompleted ?? 0,
      startedAt: input.startedAt,
      createdAt: new Date(Date.now() + this.sequence),
    });
    stepIds.push(firstStepId);

    for (const [i, extra] of (input.extraSteps ?? []).entries()) {
      const stepId = this.nextId('step');
      this.steps.set(stepId, {
        id: stepId,
        tenantId: input.tenantId,
        broadcastId: id,
        order: i + 1,
        messageTemplate: extra.messageTemplate,
        recurrenceIntervalHours: extra.recurrenceIntervalHours,
        recurrenceMaxRuns: extra.recurrenceMaxRuns,
        recurrenceEndsAt: extra.recurrenceEndsAt,
        runsCompleted: 0,
        createdAt: new Date(Date.now() + this.sequence),
      });
      stepIds.push(stepId);
    }

    const targetIds: string[] = [];
    for (const groupJid of input.groupJids ?? ['111@g.us']) {
      const targetId = this.nextId('target');
      this.targets.set(targetId, {
        id: targetId,
        tenantId: input.tenantId,
        broadcastId: id,
        groupJid,
        groupName: `Grupo ${groupJid}`,
        status: 'pending',
        createdAt: new Date(Date.now() + this.sequence),
      });
      targetIds.push(targetId);
    }

    const stepTargetIds: string[][] = stepIds.map((stepId) =>
      targetIds.map((targetId) => {
        const stepTargetId = this.nextId('step-target');
        this.stepTargets.set(stepTargetId, {
          id: stepTargetId,
          tenantId: input.tenantId,
          broadcastId: id,
          stepId,
          targetId,
          status: 'pending',
          sentCount: 0,
          createdAt: new Date(Date.now() + this.sequence),
        });
        return stepTargetId;
      }),
    );

    return { broadcastId: id, targetIds, stepIds, stepTargetIds };
  }

  /** Helper de teste: força o estado do PROGRESSO de um grupo numa etapa (ex.: simular tentativas anteriores). */
  forceStepTarget(stepTargetId: string, changes: Partial<GroupBroadcastStepTarget>): void {
    const row = this.stepTargets.get(stepTargetId);
    if (!row) return;
    this.stepTargets.set(stepTargetId, {
      ...row,
      status: changes.status ?? row.status,
      errorMessage: changes.errorMessage ?? row.errorMessage,
      sentAt: changes.sentAt ?? row.sentAt,
      attemptedAt: changes.attemptedAt ?? row.attemptedAt,
      sentCount: changes.sentCount ?? row.sentCount,
    });
  }
}

export class FakeGroupDirectory implements GroupDirectory {
  public entries: GroupDirectoryEntry[] = [];
  public nextError: Error | undefined;
  public calls: Array<{ tenantId: string; sessionName: string }> = [];

  async listGroups(tenantId: string, sessionName: string): Promise<GroupDirectoryEntry[]> {
    this.calls.push({ tenantId, sessionName });
    if (this.nextError) throw this.nextError;
    return this.entries.map((entry) => ({ ...entry }));
  }
}

export class FakeGroupMessageSender implements GroupMessageSender {
  public calls: Array<{
    tenantId: string;
    sessionName: string;
    groupJid: string;
    content: string;
    media?: GroupSendMedia;
  }> = [];
  public results: GroupMessageSendResult[] = [];

  async send(
    tenantId: string,
    sessionName: string,
    groupJid: string,
    content: string,
    media?: GroupSendMedia,
  ): Promise<GroupMessageSendResult> {
    this.calls.push({ tenantId, sessionName, groupJid, content, media });
    return this.results.shift() ?? { ok: true };
  }
}

export class FakeGroupBroadcastSendDispatcher implements GroupBroadcastSendDispatcher {
  public scheduled: Array<{
    tenantId: string;
    broadcastId: string;
    stepId: string;
    stepTargetId: string;
    delayMs: number;
  }> = [];

  public runs: Array<{
    tenantId: string;
    broadcastId: string;
    stepId: string;
    runNumber: number;
    delayMs: number;
  }> = [];

  async scheduleStepTarget(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    stepTargetId: string,
    delayMs: number,
  ): Promise<void> {
    this.scheduled.push({ tenantId, broadcastId, stepId, stepTargetId, delayMs });
  }

  async scheduleRun(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    runNumber: number,
    delayMs: number,
  ): Promise<void> {
    this.runs.push({ tenantId, broadcastId, stepId, runNumber, delayMs });
  }
}

export class FakeAuditLogRepository implements AuditLogRepository {
  public entries: NewAuditLog[] = [];
  public failNext = false;

  async record(input: NewAuditLog): Promise<AuditLog> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('falha simulada da trilha');
    }
    this.entries.push(input);
    return { ...input, id: `audit-${this.entries.length}`, occurredAt: new Date() };
  }

  async listByTenant(): Promise<AuditLogPage> {
    return { entries: [] };
  }
}
