import {
  GroupBroadcast,
  GroupBroadcastStatus,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
} from '../../../src/services/groupBroadcasts/domain/entities/GroupBroadcast';
import {
  CreateGroupBroadcastData,
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

/**
 * Test doubles do bounded context `groupBroadcasts` (Disparos em grupos,
 * 2026-09-11). Em memória, mesma disciplina de `FakeCampaignRepository`: toda
 * operação filtra por `tenantId`, então os testes de IDOR são reais.
 */
export class FakeGroupBroadcastRepository implements GroupBroadcastRepository {
  private broadcasts = new Map<string, GroupBroadcast>();
  private targets = new Map<string, GroupBroadcastTarget>();
  private media = new Map<string, GroupBroadcastMediaContent>();
  private sequence = 0;

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  async create(data: CreateGroupBroadcastData): Promise<GroupBroadcast> {
    const now = new Date(Date.now() + this.sequence);
    const broadcast: GroupBroadcast = {
      id: this.nextId('broadcast'),
      tenantId: data.tenantId,
      sessionName: data.sessionName,
      name: data.name,
      messageTemplate: data.messageTemplate,
      status: 'draft',
      intervalSeconds: data.intervalSeconds,
      createdByUserId: data.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.broadcasts.set(broadcast.id, broadcast);
    return { ...broadcast };
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

  async findTargetById(
    tenantId: string,
    targetId: string,
  ): Promise<GroupBroadcastTarget | undefined> {
    const target = this.targets.get(targetId);
    return target && target.tenantId === tenantId ? { ...target } : undefined;
  }

  async listPendingTargets(
    tenantId: string,
    broadcastId: string,
  ): Promise<GroupBroadcastTarget[]> {
    return (await this.listTargets(tenantId, broadcastId)).filter((t) => t.status === 'pending');
  }

  async summarizeTargets(tenantId: string, broadcastId: string): Promise<GroupBroadcastSummary> {
    const summary: GroupBroadcastSummary = { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 };
    for (const target of await this.listTargets(tenantId, broadcastId)) {
      summary[target.status] += 1;
      summary.total += 1;
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

  async markTargetSent(tenantId: string, targetId: string, attemptedAt: Date): Promise<void> {
    const target = this.targets.get(targetId);
    if (!target || target.tenantId !== tenantId || target.status !== 'pending') return;
    this.targets.set(targetId, { ...target, status: 'sent', sentAt: attemptedAt, attemptedAt });
  }

  async markTargetFailed(
    tenantId: string,
    targetId: string,
    attemptedAt: Date,
    errorMessage: string,
  ): Promise<void> {
    const target = this.targets.get(targetId);
    if (!target || target.tenantId !== tenantId || target.status !== 'pending') return;
    this.targets.set(targetId, { ...target, status: 'failed', attemptedAt, errorMessage });
  }

  async listRecentOutcomes(
    tenantId: string,
    broadcastId: string,
    limit: number,
  ): Promise<Array<'sent' | 'failed'>> {
    return (await this.listTargets(tenantId, broadcastId))
      .filter((t) => t.attemptedAt && (t.status === 'sent' || t.status === 'failed'))
      .sort((a, b) => (b.attemptedAt?.getTime() ?? 0) - (a.attemptedAt?.getTime() ?? 0))
      .slice(0, limit)
      .map((t) => (t.status === 'sent' ? 'sent' : 'failed'));
  }

  async countPending(tenantId: string, broadcastId: string): Promise<number> {
    return (await this.listPendingTargets(tenantId, broadcastId)).length;
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
    this.media.delete(broadcastId);
    return true;
  }

  async attachMedia(
    tenantId: string,
    broadcastId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcast | undefined> {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast || broadcast.tenantId !== tenantId) return undefined;
    this.media.set(broadcastId, media);
    const updated: GroupBroadcast = {
      ...broadcast,
      media: { contentType: media.contentType, mimeType: media.mimeType, fileName: media.fileName },
    };
    this.broadcasts.set(broadcastId, updated);
    return { ...updated };
  }

  async removeMedia(tenantId: string, broadcastId: string): Promise<GroupBroadcast | undefined> {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast || broadcast.tenantId !== tenantId) return undefined;
    this.media.delete(broadcastId);
    const updated: GroupBroadcast = { ...broadcast, media: undefined };
    this.broadcasts.set(broadcastId, updated);
    return { ...updated };
  }

  async getMediaContent(
    tenantId: string,
    broadcastId: string,
  ): Promise<GroupBroadcastMediaContent | undefined> {
    const broadcast = this.broadcasts.get(broadcastId);
    if (!broadcast || broadcast.tenantId !== tenantId) return undefined;
    return this.media.get(broadcastId);
  }

  /** Helper de teste: cria um disparo já num status específico, com alvos `pending`. */
  seedBroadcast(input: {
    tenantId: string;
    sessionName?: string;
    status?: GroupBroadcastStatus;
    intervalSeconds?: number;
    groupJids?: string[];
    messageTemplate?: string;
  }): { broadcastId: string; targetIds: string[] } {
    const now = new Date(Date.now() + this.sequence);
    const id = this.nextId('broadcast');
    this.broadcasts.set(id, {
      id,
      tenantId: input.tenantId,
      sessionName: input.sessionName ?? 'sessao',
      name: 'Disparo',
      messageTemplate: input.messageTemplate ?? 'Promoção!',
      status: input.status ?? 'draft',
      intervalSeconds: input.intervalSeconds ?? 60,
      createdAt: now,
      updatedAt: now,
    });
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
    return { broadcastId: id, targetIds };
  }

  /** Helper de teste: força o estado de um alvo (ex.: simular tentativas anteriores). */
  forceTarget(targetId: string, changes: Partial<GroupBroadcastTarget>): void {
    const target = this.targets.get(targetId);
    if (target) this.targets.set(targetId, { ...target, ...changes });
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
    targetId: string;
    delayMs: number;
  }> = [];

  async scheduleTarget(
    tenantId: string,
    broadcastId: string,
    targetId: string,
    delayMs: number,
  ): Promise<void> {
    this.scheduled.push({ tenantId, broadcastId, targetId, delayMs });
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
