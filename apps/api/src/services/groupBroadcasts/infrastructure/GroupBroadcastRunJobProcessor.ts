import { Logger } from '../../../shared/domain/Logger';
import { GroupBroadcastSendDispatcher } from '../domain/dispatchers/GroupBroadcastSendDispatcher';
import { GroupBroadcastRepository } from '../domain/repositories/GroupBroadcastRepository';
import {
  computeGroupSendDelayMs,
  initialLaunchOffsetMs,
} from '../domain/policies/groupBroadcastPacing';
import {
  buildSendWindow,
  DEFAULT_GROUP_BROADCAST_TIMEZONE,
  isWithinSendWindow,
  shiftIntoSendWindow,
} from '../domain/policies/groupBroadcastRecurrence';
import { GroupBroadcastRunJobData } from './queues/GroupBroadcastSendQueue';

export type GroupBroadcastRunOutcome =
  | 'started'
  | 'skipped'
  | 'postponed'
  | 'completed_without_targets';

/**
 * Inicia uma REPETIÇÃO (ou o lançamento inicial) de UMA ETAPA de um disparo em
 * grupos (2026-09-11, estendido em 2026-09-14 para "cadência entre
 * publicações" — cada etapa roda em PARALELO, com seu próprio ciclo, agendada
 * independente das demais — ver
 * `docs/superpowers/specs/2026-09-14-group-broadcast-etapas-design.md`).
 *
 * Quem agenda este job: `GroupBroadcastService.startBroadcast` (lançamento
 * inicial ou retomada, um por etapa) e o próprio processador de envio
 * (`GroupBroadcastSendJobProcessor`, para repetir a MESMA etapa depois de um
 * ciclo). Não existe mais "avançar para a próxima etapa" — cada etapa só se
 * repete (ou encerra sua própria recorrência), nunca dispara outra.
 *
 * 1. relê o disparo; segue apenas se ainda estiver `running` — pausar ou
 *    cancelar não precisa mexer na fila, o job dispara, vê o status e encerra
 *    (mesmo padrão de `shouldAutoRespond` ser re-checado no processamento);
 * 2. relê a ETAPA (por `stepId`, nunca mais por índice) — é dela que vem a
 *    mensagem/mídia/recorrência;
 * 3. fora da janela de horário, o ciclo é REAGENDADO para o próximo horário
 *    permitido em vez de publicar de madrugada — nunca descartado;
 * 4. devolve os alvos DESTA ETAPA a `pending` (`skipped` continua fora) e
 *    agenda os envios com o mesmo ritmo do primeiro disparo.
 */
export class GroupBroadcastRunJobProcessor {
  constructor(
    private readonly repository: GroupBroadcastRepository,
    private readonly sendDispatcher: GroupBroadcastSendDispatcher,
    private readonly logger: Logger,
  ) {}

  async process(data: GroupBroadcastRunJobData): Promise<GroupBroadcastRunOutcome> {
    const { tenantId, broadcastId, stepId, runNumber } = data;

    const broadcast = await this.repository.findById(tenantId, broadcastId);
    if (!broadcast || broadcast.status !== 'running') {
      this.logger.info('Repetição de disparo em grupos ignorada: disparo não está em execução', {
        tenantId,
        broadcastId,
        stepId,
        runNumber,
        status: broadcast?.status,
      });
      return 'skipped';
    }

    const step = await this.repository.findStepById(tenantId, stepId);
    if (!step || step.broadcastId !== broadcastId) {
      this.logger.error('Repetição de disparo em grupos sem etapa correspondente — ignorando', {
        tenantId,
        broadcastId,
        stepId,
      });
      return 'completed_without_targets';
    }

    const now = new Date();
    const window = buildSendWindow(broadcast.sendWindowStart, broadcast.sendWindowEnd);
    if (!isWithinSendWindow(now, window, DEFAULT_GROUP_BROADCAST_TIMEZONE)) {
      // Achado real de produção (2026-09-15): sem somar o escalonamento
      // aqui, TODAS as etapas postergadas na mesma madrugada convergiam pro
      // MESMO horário de abertura da janela — a cadência configurada entre
      // publicações se perdia justamente no caso em que ela mais importa (a
      // 1ª publicação de cada uma). `initialLaunchOffsetMs` já degrada pra 0
      // sozinho assim que a etapa concluir seu primeiro ciclo de verdade —
      // uma postergação de uma etapa recorrente mais adiante nunca é afetada.
      const postponedTo = new Date(
        shiftIntoSendWindow(now, window, DEFAULT_GROUP_BROADCAST_TIMEZONE).getTime() +
          initialLaunchOffsetMs(step, broadcast.stepLaunchOffsetMinutes),
      );
      await this.repository.markStepRunFinished(tenantId, step.id, step.runsCompleted, postponedTo);
      // `reschedulePostponedRun`, NUNCA `scheduleRun` aqui — ver a docstring
      // do método no port. Este job (`${stepId}-run-${runNumber}`) ainda
      // está `active` neste exato instante; usar o MESMO jobId faria tanto o
      // `remove()` quanto o `add()` internos não fazerem nada, e o
      // reagendamento nunca chegaria a existir no Redis (achado real de
      // produção, 2026-09-15 — a campanha ficava muda até uma pausa/retomada
      // manual).
      await this.sendDispatcher.reschedulePostponedRun(
        tenantId,
        broadcastId,
        step.id,
        runNumber,
        postponedTo,
        Math.max(0, postponedTo.getTime() - now.getTime()),
      );
      this.logger.info('Repetição adiada para dentro da janela de horário', {
        tenantId,
        broadcastId,
        stepId,
        runNumber,
        postponedTo,
      });
      return 'postponed';
    }

    const reopened = await this.repository.resetStepTargetsForNextRun(tenantId, step.id);
    const pendingStepTargets = await this.repository.listPendingStepTargets(tenantId, step.id);
    if (pendingStepTargets.length === 0) {
      // Todos os grupos viraram `skipped` (saímos deles, ou viraram só-admin):
      // não há o que repetir NESTA etapa — mas as demais etapas do disparo
      // seguem seu próprio ciclo independente, então a campanha só termina se
      // TODAS chegarem nesse estado.
      await this.repository.markStepFinished(tenantId, step.id, step.runsCompleted);
      this.logger.warn('Recorrência desta etapa encerrada: nenhum grupo elegível restou', {
        tenantId,
        broadcastId,
        stepId,
        runNumber,
      });
      if (await this.repository.areAllStepsFinished(tenantId, broadcastId)) {
        await this.repository.updateStatus(tenantId, broadcastId, 'completed');
        this.logger.info('Disparo em grupos concluído (todas as etapas encerradas)', {
          tenantId,
          broadcastId,
        });
      }
      return 'completed_without_targets';
    }

    for (const [index, stepTarget] of pendingStepTargets.entries()) {
      // Sequencial pelo mesmo motivo de `startBroadcast`: no máximo 30 alvos, e
      // uma falha de Redis no meio deixa o estado simples de raciocinar.
      // eslint-disable-next-line no-await-in-loop
      await this.sendDispatcher.scheduleStepTarget(
        tenantId,
        broadcastId,
        step.id,
        stepTarget.id,
        computeGroupSendDelayMs(index, broadcast.intervalSeconds, now),
      );
    }

    // Ciclo em andamento: `nextRunAt` fica null até o envio fechar o ciclo e
    // decidir o próximo horário (ou marcar a etapa como encerrada de vez).
    await this.repository.markStepRunFinished(tenantId, step.id, step.runsCompleted, null);
    this.logger.info('Repetição de disparo em grupos iniciada', {
      tenantId,
      broadcastId,
      stepId,
      runNumber,
      reopened,
      scheduled: pendingStepTargets.length,
    });
    return 'started';
  }
}
