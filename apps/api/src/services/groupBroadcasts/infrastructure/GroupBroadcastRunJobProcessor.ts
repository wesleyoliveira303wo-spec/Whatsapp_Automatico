import { Logger } from '../../../shared/domain/Logger';
import { GroupBroadcastSendDispatcher } from '../domain/dispatchers/GroupBroadcastSendDispatcher';
import { GroupBroadcastRepository } from '../domain/repositories/GroupBroadcastRepository';
import {
  computeGroupSendDelayMs,
  launchOffsetMs,
} from '../domain/policies/groupBroadcastPacing';
import {
  buildSendWindow,
  capOffsetWithinWindow,
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

    // Achado real de produção (2026-09-17): pausar/editar uma campanha nunca
    // mexe na fila (comentário da classe) — de propósito, pois um job que
    // acorda com a campanha ainda PAUSADA já é descartado pela checagem
    // acima. O buraco real é outro: se a campanha for RETOMADA antes desse
    // job antigo disparar, o status volta a ser `running` e a checagem
    // acima deixa passar — mas o `runNumber` dele é de uma rodada JÁ
    // SUPERADA pelo reagendamento da retomada (`startBroadcast` sempre
    // agenda `runsCompleted + 1`, então um job legítimo SEMPRE bate com
    // esse valor no instante em que dispara). Um `runNumber` que não bate
    // só existe se for um job órfão de antes da pausa — descartado aqui,
    // nunca reagendado (a rodada corrente, agendada pela retomada, já
    // cobre o que falta). Corrige o "publica fora de ordem/cadência"
    // relatado pelo fundador com vídeo: uma etapa antiga disparava sozinha,
    // fora do ciclo combinado, porque este job nunca soube que já tinha
    // sido substituído.
    if (runNumber !== step.runsCompleted + 1) {
      this.logger.warn(
        'Repetição de disparo em grupos obsoleta (runNumber não bate com o esperado) — descartando',
        { tenantId, broadcastId, stepId, runNumber, expectedRunNumber: step.runsCompleted + 1 },
      );
      return 'skipped';
    }

    const now = new Date();
    const window = buildSendWindow(broadcast.sendWindowStart, broadcast.sendWindowEnd);
    if (!isWithinSendWindow(now, window, DEFAULT_GROUP_BROADCAST_TIMEZONE)) {
      // Achado real de produção (2026-09-15, reforçado em 2026-09-16): sem
      // somar o escalonamento aqui, TODAS as etapas postergadas para o mesmo
      // horário de abertura da janela convergiam e saíam coladas — e isso
      // vale toda vez que a janela reabre, não só na 1ª publicação de cada
      // etapa (`launchOffsetMs` aplica sempre, ver a docstring dela).
      // `capOffsetWithinWindow` evita o efeito colateral disso: sem ela, um
      // offset maior que a própria janela empurraria a repetição pra FORA
      // dela, e a próxima tentativa cairia no mesmo loop de "fora da janela"
      // pra sempre — a etapa nunca publicaria.
      const windowOpen = shiftIntoSendWindow(now, window, DEFAULT_GROUP_BROADCAST_TIMEZONE);
      const postponedTo = new Date(
        windowOpen.getTime() +
          capOffsetWithinWindow(
            launchOffsetMs(step, broadcast.stepLaunchOffsetMinutes),
            window,
          ),
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
