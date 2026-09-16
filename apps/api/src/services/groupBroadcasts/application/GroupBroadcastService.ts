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
  GroupBroadcastStep,
  GroupBroadcastStepTarget,
  GroupBroadcastSummary,
  GroupBroadcastTarget,
} from '../domain/entities/GroupBroadcast';
import {
  DuplicateStepIdError,
  GroupBroadcastEngineNotConfiguredError,
  GroupBroadcastMediaNotFoundError,
  GroupBroadcastMediaTooLargeError,
  GroupBroadcastMediaTypeMismatchError,
  GroupBroadcastNotFoundError,
  GroupBroadcastRequiresPaidPlanError,
  GroupBroadcastStepNotFoundError,
  InvalidGroupBroadcastTransitionError,
  InvalidRecurrenceError,
  NoGroupsSelectedError,
  NoStepsProvidedError,
  TooManyGroupsSelectedError,
  TooManyStepsError,
} from '../domain/errors/groupBroadcastErrors';
import {
  DesiredStep,
  ExistingStep,
  ExistingTarget,
  reconcileSteps,
  reconcileTargets,
} from '../domain/policies/reconcileBroadcastEdit';
import {
  clampGroupIntervalSeconds,
  clampStepLaunchOffsetMinutes,
  computeGroupSendDelayMs,
  determineGroupTargetSkipReason,
  launchOffsetMs,
  MAX_GROUP_MEDIA_BYTES,
  MAX_GROUPS_PER_BROADCAST,
  MAX_STEPS_PER_BROADCAST,
} from '../domain/policies/groupBroadcastPacing';
import { GroupDirectory } from '../domain/providers/GroupDirectory';
import { GroupBroadcastSendDispatcher } from '../domain/dispatchers/GroupBroadcastSendDispatcher';
import {
  CreateGroupBroadcastStepData,
  GroupBroadcastMediaContent,
  GroupBroadcastRepository,
  GroupBroadcastTargetDraft,
} from '../domain/repositories/GroupBroadcastRepository';

/** Quantos disparos a lista de uma sessão mostra — volume baixo por natureza (ação deliberada de administrador). */
const LIST_LIMIT = 100;

/** Uma publicação da sequência, como recebida na criação — mesmos campos que `GroupBroadcastStep` tinha quando morava direto em `GroupBroadcast`. */
export interface CreateGroupBroadcastStepInput {
  messageTemplate: string;
  /** Recorrência DESTA etapa. Ausente = publica uma vez, depois avança/encerra. */
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
}

export interface CreateGroupBroadcastInput {
  tenantId: string;
  sessionName: string;
  name: string;
  groupJids: string[];
  intervalSeconds?: number;
  createdByUserId?: string;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  /**
   * Escalonamento inicial (2026-09-14, "cadência entre publicações") —
   * minutos entre o início de uma publicação e o início da seguinte, na
   * primeira vez que cada uma dispara. Ausente = todas começam juntas.
   */
  stepLaunchOffsetMinutes?: number;
  /**
   * A sequência de publicações (2026-09-14) — 1 a `MAX_STEPS_PER_BROADCAST`.
   * Um disparo "simples" (o modelo antigo) é apenas uma campanha com UMA
   * etapa; não existe segundo conceito de campanha. Desde a "cadência entre
   * publicações", todas rodam em PARALELO, cada uma com seu próprio ritmo.
   */
  steps: CreateGroupBroadcastStepInput[];
}

/**
 * Edição de uma publicação já existente (2026-09-15) — mesmos campos de
 * `CreateGroupBroadcastStepInput`, mais `id`: presente e batendo com uma etapa
 * real desta campanha → a etapa CONTINUA, só o conteúdo muda; ausente (ou não
 * batendo) → tratada como etapa NOVA pela reconciliação pura
 * (`reconcileSteps`).
 */
export interface UpdateGroupBroadcastStepInput {
  id?: string;
  messageTemplate: string;
  recurrenceIntervalHours?: number;
  recurrenceMaxRuns?: number;
  recurrenceEndsAt?: Date;
}

/**
 * O cliente envia o ESTADO FINAL DESEJADO por completo — `groupJids`/`steps`
 * não são "só o que mudou". O servidor calcula a diferença (`reconcileSteps`/
 * `reconcileTargets`) e aplica; item com histórico nunca é apagado, vira
 * "etapa encerrada" ou "grupo suprimido" (ver `updateBroadcast`).
 */
export interface UpdateGroupBroadcastInput {
  tenantId: string;
  broadcastId: string;
  name: string;
  groupJids: string[];
  intervalSeconds?: number;
  sendWindowStart?: string;
  sendWindowEnd?: string;
  stepLaunchOffsetMinutes?: number;
  steps: UpdateGroupBroadcastStepInput[];
}

/**
 * Retomar-com-escolha (2026-09-15) — `'now'` (padrão, comportamento de
 * sempre) publica de imediato; `'scheduled'` honra um horário já marcado
 * (`GroupBroadcastStep.nextRunAt`) em vez de disparar na hora, quando existir
 * um no futuro. Mesmo tipo replicado em `CampaignService` (bounded contexts
 * distintos, literal duplicado de propósito — mesmo padrão de
 * `CampaignLinkedConversationStage`).
 */
export type ResumeMode = 'now' | 'scheduled';

/** Quem executou a ação — só para a trilha de auditoria (`undefined` = plano máquina). */
export interface GroupBroadcastActor {
  userId?: string;
  ip?: string;
  userAgent?: string;
}

export interface GroupBroadcastDetail {
  broadcast: GroupBroadcast;
  steps: GroupBroadcastStep[];
  summary: GroupBroadcastSummary;
  targets: GroupBroadcastTarget[];
}

export interface GroupBroadcastListItem {
  broadcast: GroupBroadcast;
  summary: GroupBroadcastSummary;
}

/**
 * Orquestra o disparo em grupos — 2026-09-11, estendido em 2026-09-14 para
 * campanhas com múltiplas publicações em sequência ("etapas" — ver
 * `docs/superpowers/specs/2026-09-14-group-broadcast-etapas-design.md`).
 *
 * Mesma forma de `CampaignService` (criar → iniciar/pausar/cancelar → anexar
 * mídia), com três diferenças deliberadas:
 *
 * 1. **O servidor confere os grupos.** Na criação, consulta a lista AO VIVO
 *    (`GroupDirectory`) em vez de confiar em nome/permissão enviados pelo
 *    cliente: grupo que não existe mais vira `group_not_found`; grupo "só
 *    admins" onde o número não é admin vira `admin_only_group` — ambos
 *    `skipped`, sem tentativa de envio.
 * 2. **Vários disparos podem rodar ao mesmo tempo na mesma sessão** — pedido
 *    explícito do fundador (2026-09-12): não há trava nem fila por sessão.
 *    Rodar mais de um em paralelo soma o ritmo de publicação de cada um
 *    (risco de banimento aceito conscientemente; a confirmação de "Iniciar"
 *    já nomeia esse risco por disparo).
 * 3. **Trilha de auditoria** em criar/iniciar/cancelar. O motor de campanhas
 *    1:1 não audita; aqui, por ser a ação de maior raio de estrago do
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

    if (input.steps.length === 0) {
      throw new NoStepsProvidedError();
    }
    if (input.steps.length > MAX_STEPS_PER_BROADCAST) {
      throw new TooManyStepsError(input.steps.length, MAX_STEPS_PER_BROADCAST);
    }

    const windowInformed = Boolean(input.sendWindowStart) || Boolean(input.sendWindowEnd);
    if (windowInformed && !buildSendWindow(input.sendWindowStart, input.sendWindowEnd)) {
      throw new InvalidRecurrenceError(
        'A janela de horário precisa de início e fim válidos ("HH:MM") e diferentes entre si.',
      );
    }

    const stepDrafts: CreateGroupBroadcastStepData[] = input.steps.map((step, order) => {
      const recurring =
        step.recurrenceIntervalHours !== undefined && step.recurrenceIntervalHours !== null;
      if (recurring) {
        if (
          step.recurrenceMaxRuns !== undefined &&
          (step.recurrenceMaxRuns < 2 || step.recurrenceMaxRuns > MAX_RECURRENCE_RUNS)
        ) {
          throw new InvalidRecurrenceError(
            `Publicação ${order + 1}: o número de repetições precisa estar entre 2 e ${MAX_RECURRENCE_RUNS}.`,
          );
        }
        if (step.recurrenceEndsAt && step.recurrenceEndsAt.getTime() <= Date.now()) {
          throw new InvalidRecurrenceError(
            `Publicação ${order + 1}: a data de término precisa estar no futuro.`,
          );
        }
      }
      return {
        order,
        messageTemplate: step.messageTemplate,
        recurrenceIntervalHours: recurring
          ? clampRecurrenceIntervalHours(step.recurrenceIntervalHours)
          : undefined,
        recurrenceMaxRuns: recurring ? step.recurrenceMaxRuns : undefined,
        recurrenceEndsAt: recurring ? step.recurrenceEndsAt : undefined,
      };
    });

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

    const targetDrafts: GroupBroadcastTargetDraft[] = groupJids.map((groupJid) => {
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
      intervalSeconds: clampGroupIntervalSeconds(input.intervalSeconds),
      sendWindowStart: input.sendWindowStart,
      sendWindowEnd: input.sendWindowEnd,
      stepLaunchOffsetMinutes: clampStepLaunchOffsetMinutes(input.stepLaunchOffsetMinutes),
      createdByUserId: input.createdByUserId,
    });
    const steps = await this.repository.createSteps(input.tenantId, broadcast.id, stepDrafts);
    await this.repository.createTargets(input.tenantId, broadcast.id, targetDrafts);
    // Materializa o progresso de TODAS as etapas × TODOS os alvos — desde a
    // "cadência entre publicações", cada etapa roda em paralelo com sua
    // PRÓPRIA lista de "quem já recebeu" (não existe mais uma lista só,
    // compartilhada entre etapas).
    await this.repository.initializeStepTargets(input.tenantId, broadcast.id);

    const [summary, targets] = await Promise.all([
      this.repository.summarizeTargets(input.tenantId, broadcast.id),
      this.repository.listTargets(input.tenantId, broadcast.id),
    ]);

    await this.audit(input.tenantId, actor, 'group_broadcast.created', broadcast.id, {
      sessionName: input.sessionName,
      groups: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
      steps: steps.length,
    });
    this.logger.info('Disparo em grupos criado', {
      tenantId: input.tenantId,
      broadcastId: broadcast.id,
      sessionName: input.sessionName,
      total: summary.total,
      pending: summary.pending,
      skipped: summary.skipped,
      steps: steps.length,
    });

    return { broadcast, steps, summary, targets };
  }

  /**
   * Edita um disparo já criado (`draft`/`paused` apenas) — 2026-09-15. NUNCA
   * chama o dispatcher: salvar uma edição só grava no Postgres, quem agenda
   * continua sendo `startBroadcast` (invariante com teste dedicado). O
   * cliente manda o estado final desejado por inteiro; a diferença contra o
   * que já existe é calculada por `reconcileSteps`/`reconcileTargets`
   * (Domain, puras) e aplicada nesta ordem: envelope da campanha → etapas
   * atualizadas → etapas novas → grupos novos → etapas/grupos removidos →
   * grupos suprimidos → rematerializar o progresso por etapa×grupo.
   */
  async updateBroadcast(
    input: UpdateGroupBroadcastInput,
    actor: GroupBroadcastActor = {},
  ): Promise<GroupBroadcastDetail> {
    await this.assertTenantExists(input.tenantId);
    const broadcast = await this.requireBroadcast(input.tenantId, input.broadcastId);
    if (broadcast.status !== 'draft' && broadcast.status !== 'paused') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'edit');
    }

    // --- Validação do payload — mesmas regras de `createBroadcast` --------
    if (input.steps.length === 0) {
      throw new NoStepsProvidedError();
    }
    if (input.steps.length > MAX_STEPS_PER_BROADCAST) {
      throw new TooManyStepsError(input.steps.length, MAX_STEPS_PER_BROADCAST);
    }
    const seenStepIds = new Set<string>();
    for (const step of input.steps) {
      if (step.id === undefined) continue;
      if (seenStepIds.has(step.id)) {
        throw new DuplicateStepIdError(step.id);
      }
      seenStepIds.add(step.id);
    }

    const windowInformed = Boolean(input.sendWindowStart) || Boolean(input.sendWindowEnd);
    if (windowInformed && !buildSendWindow(input.sendWindowStart, input.sendWindowEnd)) {
      throw new InvalidRecurrenceError(
        'A janela de horário precisa de início e fim válidos ("HH:MM") e diferentes entre si.',
      );
    }

    const desiredSteps: DesiredStep[] = input.steps.map((step, order) => {
      const recurring =
        step.recurrenceIntervalHours !== undefined && step.recurrenceIntervalHours !== null;
      if (recurring) {
        if (
          step.recurrenceMaxRuns !== undefined &&
          (step.recurrenceMaxRuns < 2 || step.recurrenceMaxRuns > MAX_RECURRENCE_RUNS)
        ) {
          throw new InvalidRecurrenceError(
            `Publicação ${order + 1}: o número de repetições precisa estar entre 2 e ${MAX_RECURRENCE_RUNS}.`,
          );
        }
        if (step.recurrenceEndsAt && step.recurrenceEndsAt.getTime() <= Date.now()) {
          throw new InvalidRecurrenceError(
            `Publicação ${order + 1}: a data de término precisa estar no futuro.`,
          );
        }
      }
      return {
        id: step.id,
        messageTemplate: step.messageTemplate,
        recurrenceIntervalHours: recurring
          ? clampRecurrenceIntervalHours(step.recurrenceIntervalHours)
          : undefined,
        recurrenceMaxRuns: recurring ? step.recurrenceMaxRuns : undefined,
        recurrenceEndsAt: recurring ? step.recurrenceEndsAt : undefined,
      };
    });

    const groupJids = Array.from(
      new Set(input.groupJids.map((jid) => jid.trim()).filter((jid) => jid.length > 0)),
    );
    if (groupJids.length === 0) {
      throw new NoGroupsSelectedError();
    }
    if (groupJids.length > MAX_GROUPS_PER_BROADCAST) {
      throw new TooManyGroupsSelectedError(groupJids.length, MAX_GROUPS_PER_BROADCAST);
    }

    // Confere os grupos desejados AO VIVO, mesma régua da criação — inclusive
    // os que já eram alvo antes (podem ter virado "só admins" nesse meio-tempo).
    const directory = await this.groupDirectory.listGroups(input.tenantId, broadcast.sessionName);
    const byJid = new Map(directory.map((entry) => [entry.jid, entry]));

    const [existingSteps, existingTargets, historyByTarget] = await Promise.all([
      this.repository.listSteps(input.tenantId, input.broadcastId),
      this.repository.listTargets(input.tenantId, input.broadcastId),
      this.repository.countStepTargetsWithHistory(input.tenantId, input.broadcastId),
    ]);

    const existingStepsWithHistory: ExistingStep[] = await Promise.all(
      existingSteps.map(async (step) => {
        const stepTargets = await this.repository.listStepTargets(input.tenantId, step.id);
        const hasHistory = step.runsCompleted > 0 || stepTargets.some((t) => t.sentCount > 0);
        return { id: step.id, order: step.order, runsCompleted: step.runsCompleted, hasHistory };
      }),
    );
    const existingTargetsWithHistory: ExistingTarget[] = existingTargets.map((target) => ({
      id: target.id,
      groupJid: target.groupJid,
      hasHistory: (historyByTarget.get(target.id) ?? 0) > 0,
    }));

    const stepPlan = reconcileSteps(existingStepsWithHistory, desiredSteps);
    const targetPlan = reconcileTargets(existingTargetsWithHistory, groupJids);

    const targetsToCreate: GroupBroadcastTargetDraft[] = targetPlan.toCreate.map((groupJid) => {
      const entry = byJid.get(groupJid);
      const skipReason = determineGroupTargetSkipReason(entry);
      const groupName = entry?.name ?? 'Grupo não encontrado';
      return skipReason
        ? { groupJid, groupName, status: 'skipped', skipReason }
        : { groupJid, groupName, status: 'pending' };
    });

    // --- Aplicar, nesta ordem — NUNCA chama o dispatcher -------------------
    await this.repository.updateBroadcastSettings(input.tenantId, input.broadcastId, {
      name: input.name,
      intervalSeconds: clampGroupIntervalSeconds(input.intervalSeconds),
      sendWindowStart: input.sendWindowStart,
      sendWindowEnd: input.sendWindowEnd,
      stepLaunchOffsetMinutes: clampStepLaunchOffsetMinutes(input.stepLaunchOffsetMinutes),
    });

    for (const { id, desired } of stepPlan.toUpdate) {
      // eslint-disable-next-line no-await-in-loop
      await this.repository.updateStep(input.tenantId, id, {
        messageTemplate: desired.messageTemplate,
        recurrenceIntervalHours: desired.recurrenceIntervalHours,
        recurrenceMaxRuns: desired.recurrenceMaxRuns,
        recurrenceEndsAt: desired.recurrenceEndsAt,
      });
    }

    if (stepPlan.toCreate.length > 0) {
      await this.repository.createSteps(
        input.tenantId,
        input.broadcastId,
        stepPlan.toCreate.map(({ order, desired }) => ({
          order,
          messageTemplate: desired.messageTemplate,
          recurrenceIntervalHours: desired.recurrenceIntervalHours,
          recurrenceMaxRuns: desired.recurrenceMaxRuns,
          recurrenceEndsAt: desired.recurrenceEndsAt,
        })),
      );
    }

    if (targetsToCreate.length > 0) {
      await this.repository.createTargets(input.tenantId, input.broadcastId, targetsToCreate);
    }

    await this.repository.deleteSteps(input.tenantId, stepPlan.toDelete);
    await this.repository.deleteTargets(input.tenantId, targetPlan.toDelete);
    await this.repository.suppressTargets(input.tenantId, targetPlan.toSuppress, 'removed_by_operator');

    for (const stepId of stepPlan.toFinish) {
      const finishing = existingStepsWithHistory.find((step) => step.id === stepId);
      // eslint-disable-next-line no-await-in-loop
      await this.repository.markStepFinished(input.tenantId, stepId, finishing?.runsCompleted ?? 0);
    }

    // Idempotente — materializa só o que falta (etapas/grupos novos), nunca
    // duplica progresso já existente.
    await this.repository.initializeStepTargets(input.tenantId, input.broadcastId);

    const [updatedBroadcast, steps, summary, targets] = await Promise.all([
      this.repository.findById(input.tenantId, input.broadcastId),
      this.repository.listSteps(input.tenantId, input.broadcastId),
      this.repository.summarizeTargets(input.tenantId, input.broadcastId),
      this.repository.listTargets(input.tenantId, input.broadcastId),
    ]);

    await this.audit(input.tenantId, actor, 'group_broadcast.edited', input.broadcastId, {
      stepsUpdated: stepPlan.toUpdate.length,
      stepsCreated: stepPlan.toCreate.length,
      stepsDeleted: stepPlan.toDelete.length,
      stepsFinished: stepPlan.toFinish.length,
      groupsCreated: targetPlan.toCreate.length,
      groupsDeleted: targetPlan.toDelete.length,
      groupsSuppressed: targetPlan.toSuppress.length,
    });
    this.logger.info('Disparo em grupos editado', {
      tenantId: input.tenantId,
      broadcastId: input.broadcastId,
    });

    return { broadcast: updatedBroadcast!, steps, summary, targets };
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
    const [steps, summary, targets] = await Promise.all([
      this.repository.listSteps(tenantId, broadcastId),
      this.repository.summarizeTargets(tenantId, broadcastId),
      this.repository.listTargets(tenantId, broadcastId),
    ]);
    return { broadcast, steps, summary, targets };
  }

  /**
   * Inicia (ou RETOMA, após pausa) — só `draft`/`paused`. Nenhuma checagem
   * contra outros disparos da mesma sessão (2026-09-12): rodar vários em
   * paralelo é permitido, decisão explícita do fundador.
   *
   * Desde a "cadência entre publicações" (2026-09-14), CADA etapa ainda não
   * `finishedAt` é agendada independentemente:
   *
   * - se já tem grupos `pending` NESTE ciclo (foi pausada no meio de um
   *   envio) → retoma-os com delay FRESCO, contado a partir de agora (mesmo
   *   racional de `CampaignService.startCampaign`: um job que disparou
   *   durante a pausa viu `status !== 'running'` e não enviou);
   * - senão → agenda um "run" (via `GroupBroadcastRunJobProcessor`, que checa
   *   a janela de horário) — com o escalonamento inicial
   *   (`order × stepLaunchOffsetMinutes`) se a etapa NUNCA rodou, ou de
   *   imediato se está só esperando entre um ciclo e o próximo (retomar não
   *   espera o resto do temporizador antigo) — A MENOS que `resumeMode`
   *   (2026-09-15) seja `'scheduled'` e a etapa já tenha um `nextRunAt`
   *   futuro marcado: nesse caso, honra o horário já marcado em vez de
   *   disparar de imediato. Padrão `'now'` — preserva todo chamador atual.
   */
  async startBroadcast(
    tenantId: string,
    broadcastId: string,
    actor: GroupBroadcastActor = {},
    resumeMode: ResumeMode = 'now',
  ): Promise<GroupBroadcast> {
    await this.assertTenantPlanAllowsSending(tenantId);
    if (!this.sendDispatcher) {
      throw new GroupBroadcastEngineNotConfiguredError();
    }

    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft' && broadcast.status !== 'paused') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'start');
    }

    const steps = await this.repository.listSteps(tenantId, broadcastId);
    const activeSteps = steps.filter((step) => !step.finishedAt);
    if (activeSteps.length === 0) {
      const completed = await this.repository.updateStatus(tenantId, broadcastId, 'completed');
      return completed!;
    }

    const now = new Date();

    // FASE 1 — só leitura/decisão, NENHUM agendamento ainda. Um job de
    // delay 0 pode ser processado pelo worker em menos de 10ms; se
    // agendássemos antes de gravar `status: 'running'`, o job correria
    // contra essa escrita e podia ler `draft` (bug real, 2026-09-14: a
    // etapa 0, sem escalonamento, "sumia" — o job via `draft`, desistia
    // pra sempre, e nada mais a reagendava). Por isso TODA decisão é
    // tomada e gravada (inclusive `markStepFinished`/`markStepStarted`)
    // ANTES de qualquer chamada ao dispatcher.
    type StepPlan =
      | {
          kind: 'resume_pending';
          step: GroupBroadcastStep;
          pending: GroupBroadcastStepTarget[];
          stepOffsetMs: number;
        }
      | { kind: 'run'; step: GroupBroadcastStep; delayMs: number };
    const plans: StepPlan[] = [];
    /**
     * `resumeMode: 'scheduled'` honra um `nextRunAt` futuro já marcado em vez
     * de disparar de imediato (`offsetMs`). Etapa sem `nextRunAt` (nunca
     * rodou) se comporta exatamente como `'now'` — não há nada a honrar.
     */
    const resolveRunDelayMs = (step: GroupBroadcastStep, offsetMs: number): number =>
      resumeMode === 'scheduled' && step.nextRunAt && step.nextRunAt.getTime() > now.getTime()
        ? step.nextRunAt.getTime() - now.getTime()
        : offsetMs;
    for (const step of activeSteps) {
      // "Nunca rodou" — marcado explicitamente em `startedAt` (nem
      // `runsCompleted` nem `nextRunAt` bastam sozinhos: os dois ficam
      // "vazios" tanto antes do 1º ciclo quanto no meio de um ciclo em
      // andamento).
      const neverStarted = !step.startedAt;
      // eslint-disable-next-line no-await-in-loop
      const pendingStepTargets = await this.repository.listPendingStepTargets(tenantId, step.id);
      // Achado real de produção (2026-09-15, reforçado em 2026-09-16): a
      // cadência configurada entre publicações precisa valer sempre que
      // várias etapas forem (re)agendadas para o mesmo instante — não
      // importa se é a 1ª publicação, uma retomada manual depois de a
      // campanha "sumir"/dar erro, ou uma repetição qualquer. `launchOffsetMs`
      // é sempre `order × offset`, então reaplicá-lo aqui nunca causa deriva
      // — só garante o espaçamento entre etapas.
      const stepOffsetMs = launchOffsetMs(step, broadcast.stepLaunchOffsetMinutes);

      if (neverStarted && pendingStepTargets.length === 0) {
        // Todos os grupos nasceram suprimidos — esta etapa nunca teria o que
        // publicar; encerra direto, sem sequer agendar um "run" (mesmo
        // racional de sempre: repetir o vazio não tem valor).
        // eslint-disable-next-line no-await-in-loop
        await this.repository.markStepFinished(tenantId, step.id, step.runsCompleted);
        continue;
      }

      if (neverStarted) {
        // SEMPRE passa pelo "run" (que checa a janela de horário), com o
        // escalonamento inicial — nunca dispara envios direto no 1º ciclo.
        // eslint-disable-next-line no-await-in-loop
        await this.repository.markStepStarted(tenantId, step.id, now);
        plans.push({ kind: 'run', step, delayMs: resolveRunDelayMs(step, stepOffsetMs) });
        continue;
      }

      if (pendingStepTargets.length > 0) {
        // Ciclo em andamento (pausado no meio de um envio, ou o 1º ciclo
        // nunca chegou a rodar de verdade): retoma os grupos que faltam, com
        // delay FRESCO a partir de agora — mais o escalonamento inicial que
        // ainda restar para esta etapa (0 se ela já publicou ao menos uma
        // vez antes).
        plans.push({ kind: 'resume_pending', step, pending: pendingStepTargets, stepOffsetMs });
        continue;
      }

      // Sem pendentes: está entre um ciclo e o próximo (ou o 1º ciclo ainda
      // não rodou — só está aguardando na fila) — retoma na hora, mais o
      // escalonamento inicial que ainda restar (ou no `nextRunAt` já
      // marcado, se `resumeMode: 'scheduled'`).
      plans.push({ kind: 'run', step, delayMs: resolveRunDelayMs(step, stepOffsetMs) });
    }

    if (plans.length === 0) {
      const completed = await this.repository.updateStatus(tenantId, broadcastId, 'completed');
      return completed!;
    }

    // FASE 2 — grava `running` PRIMEIRO, e só então agenda. Depois deste
    // ponto, qualquer job (mesmo delay 0) sempre lê o status já commitado.
    const wasPaused = broadcast.status === 'paused';
    const updated = await this.repository.updateStatus(tenantId, broadcastId, 'running');

    let scheduledCount = 0;
    for (const plan of plans) {
      if (plan.kind === 'run') {
        // eslint-disable-next-line no-await-in-loop
        await this.sendDispatcher.scheduleRun(
          tenantId,
          broadcastId,
          plan.step.id,
          plan.step.runsCompleted + 1,
          plan.delayMs,
        );
        scheduledCount += 1;
        continue;
      }
      // Sequencial (não `Promise.all`) de propósito: no máximo 30 alvos por
      // etapa, e uma falha de Redis no meio deixa o estado fácil de
      // raciocinar.
      for (const [index, stepTarget] of plan.pending.entries()) {
        // eslint-disable-next-line no-await-in-loop
        await this.sendDispatcher.scheduleStepTarget(
          tenantId,
          broadcastId,
          plan.step.id,
          stepTarget.id,
          plan.stepOffsetMs + computeGroupSendDelayMs(index, broadcast.intervalSeconds, now),
        );
      }
      scheduledCount += plan.pending.length;
    }

    await this.audit(tenantId, actor, 'group_broadcast.started', broadcastId, {
      sessionName: broadcast.sessionName,
      scheduled: scheduledCount,
      resumed: wasPaused,
    });
    this.logger.info('Disparo em grupos iniciado/retomado', {
      tenantId,
      broadcastId,
      scheduled: scheduledCount,
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
   * Anexa (ou substitui) a imagem/vídeo de UMA ETAPA — `draft` OU `paused`
   * (2026-09-15: a edição de campanhas passou a permitir mudar mídia também
   * com o disparo pausado — quem já recebeu ficou com o conteúdo antigo, as
   * próximas publicações usam o novo; a trava original, "grupos já
   * publicados receberiam uma coisa, os seguintes outra", vira o
   * comportamento DESEJADO em vez de um problema). `running` continua
   * recusado — nunca troca conteúdo com envios em voo. Teto por tipo +
   * checagem de assinatura binária (a mesma do envio de mídia pelo operador,
   * F1.10). Referenciada por `stepId` — NUNCA por posição/ordem — porque
   * reordenar etapas não pode deixar uma mídia "grudada" na posição errada.
   */
  async attachMedia(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    media: GroupBroadcastMediaContent,
  ): Promise<GroupBroadcastStep> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft' && broadcast.status !== 'paused') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'attach_media');
    }
    const step = await this.requireStep(tenantId, broadcastId, stepId);
    const maxBytes = MAX_GROUP_MEDIA_BYTES[media.contentType];
    if (media.buffer.byteLength > maxBytes) {
      throw new GroupBroadcastMediaTooLargeError(media.buffer.byteLength, maxBytes);
    }
    if (isDeclaredMediaCategoryImplausible(media.contentType, media.buffer)) {
      const detected = sniffMediaCategory(media.buffer) ?? 'desconhecida';
      throw new GroupBroadcastMediaTypeMismatchError(media.contentType, detected);
    }
    const updated = await this.repository.attachStepMedia(tenantId, step.id, media);
    this.logger.info('Mídia anexada a uma etapa do disparo em grupos', {
      tenantId,
      broadcastId,
      stepId,
      contentType: media.contentType,
      bytes: media.buffer.byteLength,
    });
    return updated!;
  }

  async removeMedia(
    tenantId: string,
    broadcastId: string,
    stepId: string,
  ): Promise<GroupBroadcastStep> {
    await this.assertTenantExists(tenantId);
    const broadcast = await this.requireBroadcast(tenantId, broadcastId);
    if (broadcast.status !== 'draft' && broadcast.status !== 'paused') {
      throw new InvalidGroupBroadcastTransitionError(broadcast.status, 'attach_media');
    }
    const step = await this.requireStep(tenantId, broadcastId, stepId);
    const updated = await this.repository.removeStepMedia(tenantId, step.id);
    return updated!;
  }

  async getMedia(
    tenantId: string,
    broadcastId: string,
    stepId: string,
  ): Promise<GroupBroadcastMediaContent> {
    await this.assertTenantExists(tenantId);
    await this.requireStep(tenantId, broadcastId, stepId);
    const media = await this.repository.getStepMediaContent(tenantId, stepId);
    if (!media) {
      throw new GroupBroadcastMediaNotFoundError(stepId);
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

  private async requireStep(
    tenantId: string,
    broadcastId: string,
    stepId: string,
  ): Promise<GroupBroadcastStep> {
    const step = await this.repository.findStepById(tenantId, stepId);
    if (!step || step.broadcastId !== broadcastId) {
      throw new GroupBroadcastStepNotFoundError(stepId);
    }
    return step;
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
  return { total: 0, pending: 0, sent: 0, failed: 0, skipped: 0, totalSent: 0 };
}
