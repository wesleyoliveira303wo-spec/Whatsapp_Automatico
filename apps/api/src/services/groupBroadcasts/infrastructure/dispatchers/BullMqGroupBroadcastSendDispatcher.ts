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
    await this.queue.remove(jobId);
    await this.queue.add(
      GROUP_BROADCAST_RUN_JOB_NAME,
      { tenantId, broadcastId, stepId, runNumber },
      { jobId, delay: delayMs },
    );
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
    await this.queue.remove(jobId);
    await this.queue.add(
      GROUP_BROADCAST_RUN_JOB_NAME,
      { tenantId, broadcastId, stepId, runNumber },
      { jobId, delay: delayMs },
    );
  }
}
