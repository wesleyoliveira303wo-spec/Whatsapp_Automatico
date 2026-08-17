import { CampaignRepository } from '../domain/repositories/CampaignRepository';
import { CampaignMessageSender } from '../domain/providers/CampaignMessageSender';
import { CampaignSendJobData } from './queues/CampaignSendQueue';
import { shouldTripCircuitBreaker } from '../domain/policies/shouldTripCircuitBreaker';
import { Logger } from '../../../shared/domain/Logger';

/** Amostra do disjuntor — "as últimas N tentativas desta campanha" (ver `shouldTripCircuitBreaker`). */
const CIRCUIT_BREAKER_SAMPLE_SIZE = 5;

/**
 * Consome a fila `campaign-send` e entrega, de fato, UMA mensagem de
 * campanha — Fase L, Bloco L4. Instanciado exclusivamente DENTRO do processo
 * `apps/api` (único dono dos sockets Baileys, ADR #54), nunca em
 * `worker.ts`.
 *
 * FLUXO de `process()`, na ordem exata do documento aprovado (§9.3/§9.4):
 *
 * 1. **Relê `Campaign.status` do banco** (nunca confia no que o payload do
 *    job "lembra" de quando foi agendado) — só prossegue se `RUNNING`. É
 *    isto que torna pausar/cancelar uma campanha uma operação que NÃO TOCA
 *    a fila: o job dispara na hora agendada, olha o status, e não faz nada
 *    se não for mais `RUNNING`. Termina o job normalmente (nunca lança) —
 *    com `removeOnComplete: true` (ver composição do Worker), isso libera o
 *    `jobId` para um reagendamento futuro (retomar a campanha).
 * 2. **Relê `CampaignRecipient.status`** — só prossegue se `PENDING` (camada
 *    3 de idempotência, §9.4): um destinatário já `SENT`/`FAILED` não é
 *    reprocessado mesmo que o job rode de novo.
 * 3. **Teto diário** (`Campaign.dailyLimit`, contagem de `SENT` de HOJE
 *    nesta campanha): se atingido, PAUSA a campanha automaticamente
 *    (`pausedReason: 'daily_limit_reached'`) e não envia agora — o
 *    destinatário permanece `PENDING`, pronto para ser reagendado quando a
 *    campanha for retomada (dia seguinte).
 * 4. **Envia** via `CampaignMessageSender` (porta para `services/whatsapp`).
 * 5. **Grava o resultado**: sucesso → `SENT` + `sentAt`/`conversationId`;
 *    falha → `FAILED` + `errorMessage`. Ambos gravam `attemptedAt`.
 * 6. **Disjuntor de segurança**: reavalia as últimas tentativas desta
 *    campanha; se a taxa de falha ultrapassar o limiar, PAUSA a campanha
 *    (`pausedReason: 'high_failure_rate'`).
 * 7. **Fecha o ciclo**: se não sobrou nenhum destinatário `PENDING`, marca a
 *    campanha `COMPLETED`.
 */
export class CampaignSendJobProcessor {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly campaignMessageSender: CampaignMessageSender,
    private readonly logger: Logger,
  ) {}

  async process(data: CampaignSendJobData): Promise<void> {
    const campaign = await this.campaignRepository.findById(data.tenantId, data.campaignId);
    if (!campaign || campaign.status !== 'running') {
      this.logger.info('Job campaign-send descartado: campanha não está em execução', {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        status: campaign?.status,
      });
      return;
    }

    const recipient = await this.campaignRepository.findRecipientById(
      data.tenantId,
      data.recipientId,
    );
    if (!recipient || recipient.status !== 'pending') {
      this.logger.info('Job campaign-send descartado: destinatário já processado', {
        tenantId: data.tenantId,
        recipientId: data.recipientId,
        status: recipient?.status,
      });
      return;
    }

    const sentToday = await this.campaignRepository.countSentToday(data.tenantId, data.campaignId);
    if (sentToday >= campaign.dailyLimit) {
      await this.campaignRepository.updateCampaignStatus(
        data.tenantId,
        data.campaignId,
        'paused',
        'daily_limit_reached',
      );
      this.logger.warn('Campanha pausada automaticamente: teto diário atingido', {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        sentToday,
        dailyLimit: campaign.dailyLimit,
      });
      return;
    }

    const result = await this.campaignMessageSender.send(
      data.tenantId,
      campaign.sessionName,
      recipient.contactId,
      campaign.messageTemplate,
    );
    const attemptedAt = new Date();

    if (result.ok && result.conversationId) {
      await this.campaignRepository.markRecipientSent(data.tenantId, data.recipientId, {
        attemptedAt,
        conversationId: result.conversationId,
      });
    } else {
      const failureReason = result.failureReason ?? 'erro_desconhecido';
      await this.campaignRepository.markRecipientFailed(data.tenantId, data.recipientId, {
        attemptedAt,
        errorMessage: failureReason,
      });
      this.logger.warn('Falha ao enviar mensagem de campanha', {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
        recipientId: data.recipientId,
        reason: failureReason,
      });
    }

    const recentOutcomes = await this.campaignRepository.listRecentOutcomes(
      data.tenantId,
      data.campaignId,
      CIRCUIT_BREAKER_SAMPLE_SIZE,
    );
    if (shouldTripCircuitBreaker(recentOutcomes)) {
      await this.campaignRepository.updateCampaignStatus(
        data.tenantId,
        data.campaignId,
        'paused',
        'high_failure_rate',
      );
      this.logger.error(
        'Campanha pausada automaticamente: disjuntor de segurança acionado (taxa de falha alta)',
        { tenantId: data.tenantId, campaignId: data.campaignId, recentOutcomes },
      );
      return;
    }

    const remainingPending = await this.campaignRepository.countPending(
      data.tenantId,
      data.campaignId,
    );
    if (remainingPending === 0) {
      await this.campaignRepository.updateCampaignStatus(
        data.tenantId,
        data.campaignId,
        'completed',
      );
      this.logger.info('Campanha concluída: nenhum destinatário pendente restante', {
        tenantId: data.tenantId,
        campaignId: data.campaignId,
      });
    }
  }
}
