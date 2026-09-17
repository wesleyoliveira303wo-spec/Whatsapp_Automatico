import { Queue } from 'bullmq';

import { GroupBroadcastSendDispatcher } from '../../domain/dispatchers/GroupBroadcastSendDispatcher';
import {
  GROUP_BROADCAST_RUN_JOB_NAME,
  GROUP_BROADCAST_SEND_JOB_NAME,
  GroupBroadcastRunJobData,
  GroupBroadcastSendJobData,
} from '../queues/GroupBroadcastSendQueue';

/**
 * Produtor real da fila `group-broadcast-send` — Disparos em grupos
 * (2026-09-11), estendido em 2026-09-14 para etapas em PARALELO ("cadência
 * entre publicações" — cada etapa tem seu próprio ciclo, agendado
 * independente das demais). Carrega as DUAS lições já pagas pelo motor de
 * campanhas:
 *
 * 1. **`jobId` sem `:`.** O BullMQ recusa `jobId` com `:` a menos que tenha
 *    exatamente 3 partes (`Custom Id cannot contain :`), e a exceção derrubou
 *    em silêncio o 2º parágrafo de toda resposta da IA por semanas (ver
 *    CLAUDE.md §18, "balão único"). `jobId = stepTargetId` (UUID puro, só `-`)
 *    — e a checagem abaixo nomeia o culpado se isso um dia mudar.
 * 2. **Remover antes de adicionar.** Um job já concluído/falho com o mesmo
 *    `jobId` faz o `add()` seguinte ser ignorado sem erro — retomar um
 *    disparo pausado não reagendaria nada (bug real de 2026-08-18 em
 *    `BullMqCampaignSendDispatcher`). `queue.remove` é idempotente.
 */
/**
 * Teto da varredura de jobs pendentes (ver `removeOtherPendingRuns`). Alto o
 * bastante para cobrir qualquer cenário real deste produto (etapas × campanhas
 * ativas) e baixo o bastante para nunca virar uma leitura cara do Redis.
 */
const PENDING_RUN_SCAN_LIMIT = 500;

export class BullMqGroupBroadcastSendDispatcher implements GroupBroadcastSendDispatcher {
  constructor(
    private readonly queue: Queue<GroupBroadcastSendJobData | GroupBroadcastRunJobData>,
  ) {}

  async scheduleStepTarget(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    stepTargetId: string,
    delayMs: number,
  ): Promise<void> {
    if (stepTargetId.includes(':')) {
      throw new Error(
        `jobId inválido para o BullMQ ("${stepTargetId}"): não pode conter ':' — use o id do alvo (UUID).`,
      );
    }
    await this.queue.remove(stepTargetId);
    await this.queue.add(
      GROUP_BROADCAST_SEND_JOB_NAME,
      { tenantId, broadcastId, stepId, stepTargetId },
      { jobId: stepTargetId, delay: delayMs },
    );
  }

  async scheduleRun(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    runNumber: number,
    delayMs: number,
  ): Promise<void> {
    // Mesma regra do `jobId` de envio: sem ':' (o BullMQ recusa). O número da
    // repetição entra na chave para um ciclo novo nunca ser engolido como
    // duplicata de um ciclo antigo que ainda esteja retido em Redis.
    const jobId = `${stepId}-run-${runNumber}`;
    await this.removeOtherPendingRuns(stepId, jobId);
    await this.queue.remove(jobId);
    await this.queue.add(
      GROUP_BROADCAST_RUN_JOB_NAME,
      { tenantId, broadcastId, stepId, runNumber },
      { jobId, delay: delayMs },
    );
  }

  /**
   * UMA etapa só pode ter UM job de repetição pendente — achado real de
   * produção (2026-09-17, medido no Redis: a etapa `303dd023` tinha `run-5`,
   * `run-6` e `run-7` pendentes, TODOS agendados para o MESMO instante
   * (10:00 UTC, a abertura da janela), e a etapa `5a8f9eb7` tinha `run-10` e
   * `run-11` para 10:30).
   *
   * Como surgia: o `jobId` inclui o `runNumber`, então cada novo agendamento
   * (fim de ciclo, retomada, edição) cria uma chave DIFERENTE — o
   * `queue.remove(jobId)` abaixo só apaga a chave idêntica, nunca as antigas.
   * E como `computeNextRunAt` empurra para a abertura da janela tudo que
   * cairia de madrugada, todos esses jobs convergiam para o MESMO horário.
   * Resultado: a etapa publicava 2–3 vezes seguidas na abertura da janela, e
   * as 4 publicações da campanha saíam "todas juntas" — exatamente o que o
   * fundador reportou (com vídeo) em 23:07 BRT.
   *
   * A varredura é barata e limitada por construção: no máximo
   * `MAX_STEPS_PER_BROADCAST` etapas × poucas campanhas ativas por sessão.
   * Só toca jobs de REPETIÇÃO (prefixo `${stepId}-run-`) — os jobs de ENVIO
   * usam o id do alvo (UUID puro) e nunca casam com esse prefixo.
   */
  private async removeOtherPendingRuns(stepId: string, keepJobId: string): Promise<void> {
    const prefix = `${stepId}-run-`;
    const pending = [
      ...(await this.queue.getDelayed(0, PENDING_RUN_SCAN_LIMIT)),
      ...(await this.queue.getWaiting(0, PENDING_RUN_SCAN_LIMIT)),
    ];
    for (const job of pending) {
      const id = job.id;
      if (!id || id === keepJobId || !id.startsWith(prefix)) continue;
      // `Queue.remove` é idempotente e nunca lança sobre um job travado
      // (devolve 0) — diferente de `Job.remove()`.
      // eslint-disable-next-line no-await-in-loop
      await this.queue.remove(id);
    }
  }

  /**
   * Achado real de produção (2026-09-15): NUNCA reusar `${stepId}-run-${runNumber}`
   * aqui — é exatamente o `jobId` do job que está chamando este método, ainda
   * `active` no momento da chamada. `queue.remove()` sobre um job travado
   * devolve `0` sem remover nada (o BullMQ só lança em `Job.remove()`, não em
   * `Queue.remove()`); `queue.add()` com um `jobId` que já existe (mesmo
   * travado) cai no caminho de "job duplicado" do Lua e devolve o job
   * existente SEM criar nenhum registro novo no `delayed` set. As duas
   * chamadas silenciosamente não fazem nada — o reagendamento nunca era
   * persistido, e a campanha ficava muda até uma pausa/retomada manual. O
   * `jobId` aqui embute o instante-alvo (`postponedTo`), então nunca colide
   * com o job em execução.
   */
  async reschedulePostponedRun(
    tenantId: string,
    broadcastId: string,
    stepId: string,
    runNumber: number,
    postponedTo: Date,
    delayMs: number,
  ): Promise<void> {
    const jobId = `${stepId}-run-${runNumber}-postponed-${postponedTo.getTime()}`;
    // Um adiamento também É "a próxima rodada desta etapa" — qualquer outro
    // job de repetição pendente para ela está superado (2026-09-17).
    await this.removeOtherPendingRuns(stepId, jobId);
    await this.queue.remove(jobId);
    await this.queue.add(
      GROUP_BROADCAST_RUN_JOB_NAME,
      { tenantId, broadcastId, stepId, runNumber },
      { jobId, delay: delayMs },
    );
  }
}
