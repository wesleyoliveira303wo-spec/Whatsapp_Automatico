import {
  MAX_RECURRENCE_RUNS,
  buildSendWindow,
  clampRecurrenceIntervalHours,
} from '../domain/policies/groupBroadcastRecurrence';
import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { Tenant } from '../../../shared/tenant/domain/Tenant';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { planPermiteUso } from '../../../shared/tenant/domain/planPermiteUso';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import {
  isDeclaredMediaCategoryImplausible,
  sniffMediaCategory,
} from '../../conversations/domain/mediaMagicBytes';
import {
  GroupBroadcast,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
} from '../domain/entities/GroupBroadcast';
import {
  GroupBroadcastAlreadyRunningError,
  GroupBroadcastEngineNotConfiguredError,
  GroupBroadcastMediaNotFoundError,
  GroupBroadcastMediaTooLargeError,
  GroupBroadcastMediaTypeMismatchError,
  GroupBroadcastNotFoundError,
  GroupBroadcastRequiresPaidPlanError,
  InvalidGroupBroadcastTransitionError,
  InvalidRecurrenceError,
  NoGroupsSelectedError,
  TooManyGroupsSelectedError,
} from '../domain/errors/groupBroadcastErrors';
import {
  clampGroupIntervalSeconds,
  computeGroupSendDelayMs,
  determineGroupTargetSkipReason,
  MAX_GROUP_MEDIA_BYTES,
  MAX_GROUPS_PER_BROADCAST,
} from '../domain/policies/groupBroadcastPacing';
import { GroupDirectory } from '../domain/providers/GroupDirectory';
import { GroupBroadcastSendDispatcher } from '../domain/dispatchers/GroupBroadcastSendDispatcher';
import {
  GroupBroadcastMediaContent,
  GroupBroadcastRepository,
  GroupBroadcastTargetDraft,
} from '../domain/repositories/GroupBroadcastRepository';

/** Quantos disparos a lista de uma sessão mostra — volume baixo por natureza (ação deliberada de administrador). */
const LIST_LIMIT = 100;

export interface CreateGroupBroadcastInput {
  tenantId: string;
  sessionName: string;
  name: string;
  messageTemplate: string;
  groupJids: string[];
  intervalSeconds?: number;
  createdByUserId?: string;
  /**
   * Recorrência (2026-09-11). `recurrenceIntervalHours` ausente = publicação
   * única. As três formas de término convivem: teto de repetições
   * (`recurrenceMaxRuns`), data/hora limite (`recurrenceEndsAt`), e "até eu
   * cancelar" (nenhuma das duas).
   */
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
  sendWindowStart?: string;
  sendWindowEnd?: string;
}

/** Quem executou a ação — só para a trilha de auditoria (`undefined` = plano máquina). */
export interface GroupBroadcastActor {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export interface GroupBroadcastDetail {
  broadcast: GroupBroadcast;
  summary: GroupBroadcastSummary;
  targets: GroupBroadcastTarget[];
}

export interface GroupBroadcastListItem {
  broadcast: GroupBroadcast;
  summary: GroupBroadcastSummary;
}

/**
 * Orquestra o disparo ÚNICO de uma mensagem em grupos — 2026-09-11.
 *
 * Mesma forma de `CampaignService` (criar → iniciar/pausar/cancelar → anexar
 * mídia), com três diferenças deliberadas:
 *
 * 1. **O servidor confere os grupos.** Na criação, consulta a lista AO VIVO
 *    (`GroupDirectory`) em vez de confiar em nome/permissão enviados pelo
 *    cliente: grupo que não existe mais vira `group_not_found`; grupo "só
 *    admins" onde o número não é admin vira `admin_only_group` — ambos
 *    `skipped`, sem tentativa de envio.
 * 2. **Um disparo em andamento por sessão.** Iniciar um segundo enquanto
 *    outro roda é recusado (`GroupBroadcastAlreadyRunningError`) — dois em
 *    paralelo dobrariam o ritmo de publicação.
 * 3. **Trilha de auditoria** em criar/iniciar/cancelar. O motor de campanhas
 *    1:1 não audita; aqui, por ser a ação de maior risco de banimento do
 *    produto, a pergunta "quem mandou isto para 30 grupos?" precisa ter
 *    resposta. `auditLogRepository` é OPCIONAL (mesmo padrão das demais
 *    dependências auxiliares): ausente, só não registra — nunca quebra a ação.
 */
export class GroupBroadcastService {
  constructor(
    private readonly repository: GroupBroadcastRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly groupDirectory: GroupDirectory,
    private readonly logger: Logger,
    private sendDispatcher?: GroupBroadcastSendDispatcher,
    private readonly auditLogRepository?: AuditLogRepository,
  ) {}

  /** Injeção tardia do motor de envio — mesmo motivo/padrão de `CampaignService.setCampaignSendDispatcher`. */
  setSendDispatcher(dispatcher: GroupBroadcastSendDispatcher): void {
    this.sendDispatcher = dispatcher;
  }

  async createBroadcast(
    input: CreateGroupBroadcastInput,
    actor: GroupBroadcastActor = {},
  ): Promise<GroupBroadcastDetail> {
    await this.assertTenantExists(input.tenantId);

    const groupJids = Array.from(
      new Set(input.groupJids.map((jid) => jid.trim()).filter((jid) => jid.length > 0)),
    );
    if (groupJids.length === 0) {
      throw new NoGroupsSelectedError();
    }
    if (groupJids.length > MAX_GROUPS_PER_BROADCAST) {
      throw new TooManyGroupsSelectedError(groupJids.length, MAX_GROUPS_PER_BROADCAST);
    }

    // Lança `GroupDirectoryUnavailableError` se não der para perguntar — a
    // criação falha em vez de gravar alvos sem conferência.
    const directory = await this.groupDirectory.listGroups(input.tenantId, input.sessionName);
    const byJid = new Map(directory.map((entry) => [entry.jid, entry]));

    const recurring =
      input.recurrenceIntervalHours !== undefined && input.recurrenceIntervalHours !== null;
    if (recurring) {
      if (
        input.recurrenceMaxRuns !== undefined &&
        (input.recurrenceMaxRuns < 2 || input.recurrenceMaxRuns > MAX_RECURRENCE_RUNS)
      ) {
        throw new InvalidRecurrenceError(
          `O número de repetições precisa estar entre 2 e ${MAX_RECURRENCE_RUNS}.`,
        );
      }
      if (input.recurrenceEndsAt && input.recurrenceEndsAt.getTime() <= Date.now()) {
        throw new InvalidRecurrenceError('A data de término precisa estar no futuro.');
      }
      const windowInformed = Boolean(input.sendWindowStart) || Boolean(input.sendWindowEnd);
      if (
        windowInformed &&
        !buildSendWindow(input.sendWindowStart, input.sendWindowEnd)
      ) {
        throw new InvalidRecurrenceError(
          'A janela de horário precisa de início e fim válidos ("HH:MM") e diferentes entre si.',
        );
      }
    }

    const drafts: GroupBroadcastTargetDraft[] = groupJids.map((groupJid) => {
      const entry = byJid.get(groupJid);
      const skipReason = determineGroupTargetSkipReason(entry);
      const groupName = entry?.name ?? 'Grupo não encontrado';
      return skipReason
        ? { groupJid, groupName, status: 'skipped', skipReason }
        : { groupJid, groupName, status: 'pending' };
    });

    const broadcast = await this.repository.create({
      tenantId: input.tenantId,
      sessionName: input.sessionName,
      name: input.name,
      messageTemplate: input.messageTemplate,
      intervalSeconds: clampGroupIntervalSeconds(input.intervalSeconds),
      // Recorrência: o intervalo passa pelo clamp do Domain (1h–24h); os
      // limites de término e a janela são gravados como vieram (a rota já
      // valida formato), e `undefined` em todos = publicação única.
      recurrenceIntervalHours: recurring
        ? clampRecurrenceIntervalHours(input.recurrenceIntervalHours)
        : undefined,
      recurrenceMaxRuns: recurring ? input.recurrenceMaxRuns : undefined,
      recurrenceEndsAt: recurring ? input.recurrenceEndsAt : undefined,
      sendWindowStart: recurring ? input.sendWindowStart : undefined,
      sendWindowEnd: recurring ? input.sendWindowEnd : undefined,
      createdByUserId: input.createdByUserId,
    });
    await this.repository.createTargets(input.tenantId, broadcast.id, drafts);

    const [summary, targets] = await Promise.all([
      this.repository.summarizeTargets(input.tenantId, broadcast.id),
      this.repository.listTargets(input.tenantId, broadcast.id),
    ]);

    await this.audit(input.tenantId, actor, 'group_broadcast.created', broadcast.id, {
      sessionName: input.sessionName,
      groups: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
      recurrenceIntervalHours: broadcast.recurrenceIntervalHours,
    });
    this.logger.info('Disparo em grupos criado', {
      tenantId: input.tenantId,
      broadcastId: broadcast.id,
      sessionName: input.sessionName,
      total: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
    });

    return { broadcast, summary, targets };
  }

  async listBroadcasts(tenantId: string, sessionName: string): Promise<GroupBroadcastListItem[]> {
    await this.assertTenantExists(tenantId);
    const broadcasts = await this.repository.listBySession(tenantId, sessionName, LIST_LIMIT);
    const summaries = await this.repository.summarizeTargetsForBroadcasts(
      tenantId,
      broadcasts.map((broadcast) => broadcast.id),
    );
    return broadcasts.map((broadcast) => ({
      broadcast,
      summary: summaries.get(broadcast.id) ?? emptySummary(),
    }));
  }

  async getBroadcast(tenantId: string, broadcastId: string): Promise<GroupBroadcastDetail> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    const [summary, targets] = await Promise.all([
      this.repository.summarizeTargets(tenantId, broadcastId),
      this.repository.listTargets(tenantId, broadcastId),
    ]);
    return { broadcast, summary, targets };
  }

  /**
   * Inicia (ou RETOMA, após pausa) — só `draft`/`paused`. Reagenda TODO alvo
   * ainda `pending` com delay FRESCO, contado a partir de agora (mesmo
   * racional de `CampaignService.startCampaign`: um job que disparou durante a
   * pausa viu `status !== 'running'` e não enviou; o alvo ficou `pending`,
   * órfão, até este método rodar de novo).
   */
  async startBroadcast(
    tenantId: string,
    broadcastId: string,
    actor: GroupBroadcastActor = {},
  ): Promise<GroupBroadcast> {
    await this.assertTenantPlanAllowsSending(tenantId);
    if (!this.sendDispatcher) {
      throw new GroupBroadcastEngineNotConfiguredError();
    }

    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft' && broadcast.status !== 'paused') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'start');
    }

    const running = await this.repository.countRunningBySession(
      tenantId,
      broadcast.sessionName,
      broadcast.id,
    );
    if (running > 0) {
      throw new GroupBroadcastAlreadyRunningError(broadcast.sessionName);
    }

    const pendingTargets = await this.repository.listPendingTargets(tenantId, broadcastId);
    if (pendingTargets.length === 0) {
      const completed = await this.repository.updateStatus(tenantId, broadcastId, 'completed');
      return completed!;
    }

    const now = new Date();
    for (const [index, target] of pendingTargets.entries()) {
      // Sequencial (não `Promise.all`) de propósito: são no máximo 30 alvos, e
      // uma falha de Redis no meio deixa o estado fácil de raciocinar — o
      // disparo não chega a virar `running` e pode ser iniciado de novo (o
      // dispatcher remove o job antigo antes de reagendar).
      // eslint-disable-next-line no-await-in-loop
      await this.sendDispatcher.scheduleTarget(
        tenantId,
        broadcastId,
        target.id,
        computeGroupSendDelayMs(index, broadcast.intervalSeconds, now),
      );
    }

    const updated = await this.repository.updateStatus(tenantId, broadcastId, 'running');
    await this.audit(tenantId, actor, 'group_broadcast.started', broadcastId, {
      sessionName: broadcast.sessionName,
      scheduled: pendingTargets.length,
      resumed: broadcast.status === 'paused',
    });
    this.logger.info('Disparo em grupos iniciado/retomado', {
      tenantId,
      broadcastId,
      scheduled: pendingTargets.length,
    });
    return updated!;
  }

  /** Pausa (só `running`). Não toca a fila — os jobs disparam, veem o status e não enviam. */
  async pauseBroadcast(tenantId: string, broadcastId: string): Promise<GroupBroadcast> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'running') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'pause');
    }
    const updated = await this.repository.updateStatus(
      tenantId,
      broadcastId,
      'paused',
      'paused_manually',
    );
    this.logger.info('Disparo em grupos pausado manualmente', { tenantId, broadcastId });
    return updated!;
  }

  /** Cancela (terminal) — de qualquer status ainda não terminal. */
  async cancelBroadcast(
    tenantId: string,
    broadcastId: string,
    actor: GroupBroadcastActor = {},
  ): Promise<GroupBroadcast> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status === 'completed' || broadcast.status === 'cancelled') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'cancel');
    }
    const updated = await this.repository.updateStatus(tenantId, broadcastId, 'cancelled');
    await this.audit(tenantId, actor, 'group_broadcast.cancelled', broadcastId, {
      sessionName: broadcast.sessionName,
      previousStatus: broadcast.status,
    });
    this.logger.info('Disparo em grupos cancelado', { tenantId, broadcastId });
    return updated!;
  }

  /** Exclui (recusa `running` — pause ou cancele antes, mesma régua de `deleteCampaign`). */
  async deleteBroadcast(tenantId: string, broadcastId: string): Promise<void> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status === 'running') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'delete');
    }
    await this.repository.deleteById(tenantId, broadcastId);
    this.logger.info('Disparo em grupos excluído', { tenantId, broadcastId });
  }

  /**
   * Anexa (ou substitui) a imagem/vídeo — só em `draft` (depois de iniciado,
   * o conteúdo não pode mudar no meio: grupos já publicados receberiam uma
   * coisa, os seguintes outra). Teto por tipo + checagem de assinatura binária
   * (a mesma do envio de mídia pelo operador, F1.10).
   */
  async attachMedia(
    tenantId: string,
    broadcastId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcast> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'attach_media');
    }
    const maxBytes = MAX_GROUP_MEDIA_BYTES[media.contentType];
    if (media.buffer.byteLength > maxBytes) {
      throw new GroupBroadcastMediaTooLargeError(media.buffer.byteLength, maxBytes);
    }
    if (isDeclaredMediaCategoryImplausible(media.contentType, media.buffer)) {
      const detected = sniffMediaCategory(media.buffer) ?? 'desconhecida';
      throw new GroupBroadcastMediaTypeMismatchError(media.contentType, detected);
    }
    const updated = await this.repository.attachMedia(tenantId, broadcastId, media);
    this.logger.info('Mídia anexada ao disparo em grupos', {
      tenantId,
      broadcastId,
      contentType: media.contentType,
      bytes: media.buffer.byteLength,
    });
    return updated!;
  }

  async removeMedia(tenantId: string, broadcastId: string): Promise<GroupBroadcast> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'attach_media');
    }
    const updated = await this.repository.removeMedia(tenantId, broadcastId);
    return updated!;
  }

  async getMedia(tenantId: string, broadcastId: string): Promise<GroupBroadcastMediaContent> {
    await this.assertTenantExists(tenantId);
    const media = await this.repository.getMediaContent(tenantId, broadcastId);
    if (!media) {
      throw new GroupBroadcastMediaNotFoundError(broadcastId);
    }
    return media;
  }

  private async requireBroadcast(tenantId: string, broadcastId: string): Promise<GroupBroadcast> {
    const broadcast = await this.repository.findById(tenantId, broadcastId);
    if (!broadcast) {
      throw new GroupBroadcastNotFoundError(broadcastId);
    }
    return broadcast;
  }

  private async assertTenantExists(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }
    return tenant;
  }

  /** Mesma trava de plano do disparo de campanha (`planPermiteUso`, fonte única). */
  private async assertTenantPlanAllowsSending(tenantId: string): Promise<void> {
    const tenant = await this.assertTenantExists(tenantId);
    if (!planPermiteUso(tenant.plan)) {
      throw new GroupBroadcastRequiresPaidPlanError();
    }
  }

  /** Nunca derruba a ação por falha da trilha — a trilha é registro auxiliar (mesma política de `SupportAccessService.tryTenantAudit`). */
  private async audit(
    tenantId: string,
    actor: GroupBroadcastActor,
    action: string,
    broadcastId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditLogRepository) return;
    try {
      await this.auditLogRepository.record({
        tenantId,
        actorUserId: actor.userId,
        action,
        targetType: 'group_broadcast',
        targetId: broadcastId,
        metadata,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    } catch (error) {
      this.logger.warn('Falha ao registrar auditoria do disparo em grupos', {
        tenantId,
        broadcastId,
        action,
        error,
      });
    }
  }
}

function emptySummary(): GroupBroadcastSummary {
  return { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0 };
}
