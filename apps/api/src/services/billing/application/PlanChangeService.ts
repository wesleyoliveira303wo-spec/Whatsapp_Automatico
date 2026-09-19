import { Logger } from '../../../shared/domain/Logger';
import { isPlanDowngrade, sessionLimitFor } from '../../../shared/tenant/domain/planCapabilities';
import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { AuditLogRepository } from '../../auth/domain/repositories/AuditLogRepository';
import { CampaignDowngradeHandler } from '../domain/providers/CampaignDowngradeHandler';
import { GroupBroadcastDowngradeHandler } from '../domain/providers/GroupBroadcastDowngradeHandler';
import { SessionDowngradeHandler } from '../domain/providers/SessionDowngradeHandler';

/**
 * A rotina de descida de plano (B5, etapa 3, spec §5.2) — aplicada sempre que
 * o plano de um tenant DIMINUI, qualquer que seja a causa (assinatura
 * cancelada por atraso vencido, o cliente troca para um plano menor no
 * portal, ou o `/admin` rebaixa manualmente). Um único caminho, chamado
 * pelos dois lugares que mudam `Tenant.plan`: `BillingService.syncFromStripe`
 * e `TenantControlService.changePlan`.
 *
 * `applyIfDowngrade` decide sozinho se `from → to` é de fato uma descida —
 * quem chama nunca precisa checar antes, e pode chamar sempre (subida ou
 * descida) sem custo extra na subida.
 *
 * NUNCA escreve `Tenant.plan` nem reaudita "o plano mudou" — os dois
 * chamadores já fazem as duas coisas, cada um do seu jeito (`self_service`
 * pelo Stripe, `self_service`/`manual` decidido pelo `/admin`). Escrever ou
 * auditar aqui de novo duplicaria a entrada de auditoria e arriscaria
 * sobrescrever a origem que o `/admin` já decidiu. Este serviço só cuida da
 * CONSEQUÊNCIA física da descida — sessões excedentes, campanhas/disparos em
 * execução — e da sua própria auditoria (`billing.plan_downgrade_applied`,
 * distinta de `billing.plan_changed`/`tenant.plan_changed`).
 *
 * Idempotente: chamar duas vezes com o mesmo `to` desconecta/pausa só o que
 * ainda estiver acima do limite/rodando — as três portas já garantem isso.
 */
export class PlanChangeService {
  private sessionHandler?: SessionDowngradeHandler;
  private campaignHandler?: CampaignDowngradeHandler;
  private groupBroadcastHandler?: GroupBroadcastDowngradeHandler;

  constructor(
    private readonly logger: Logger,
    private readonly auditLog?: AuditLogRepository,
  ) {}

  /** Injeção tardia (mesmo padrão de `setMediaSender`/`setCampaignSendDispatcher`) — as três portas nascem depois de `services/whatsapp`/`campaigns`/`groupBroadcasts` existirem. */
  setSessionDowngradeHandler(handler: SessionDowngradeHandler): void {
    this.sessionHandler = handler;
  }

  setCampaignDowngradeHandler(handler: CampaignDowngradeHandler): void {
    this.campaignHandler = handler;
  }

  setGroupBroadcastDowngradeHandler(handler: GroupBroadcastDowngradeHandler): void {
    this.groupBroadcastHandler = handler;
  }

  async applyIfDowngrade(tenantId: string, from: TenantPlan, to: TenantPlan): Promise<void> {
    if (!isPlanDowngrade(from, to)) return;

    const newLimit = sessionLimitFor(to);
    const results = await Promise.allSettled([
      this.sessionHandler?.detachExcessSessions(tenantId, newLimit),
      this.campaignHandler?.pauseRunning(tenantId),
      this.groupBroadcastHandler?.pauseRunning(tenantId),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn('Falha ao aplicar uma parte da descida de plano', {
          tenantId,
          from,
          to,
          error: result.reason,
        });
      }
    }

    await this.audit(tenantId, from, to);
  }

  /** Nunca derruba a descida por falha da trilha (mesma política do resto do projeto). */
  private async audit(tenantId: string, from: TenantPlan, to: TenantPlan): Promise<void> {
    if (!this.auditLog) return;
    try {
      await this.auditLog.record({
        tenantId,
        action: 'billing.plan_downgrade_applied',
        targetType: 'subscription',
        targetId: tenantId,
        metadata: { from, to },
      });
    } catch (error) {
      this.logger.warn('Falha ao registrar auditoria da descida de plano', { tenantId, error });
    }
  }
}
