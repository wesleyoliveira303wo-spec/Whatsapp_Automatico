import { PlanChangeService } from '../../../../src/services/billing/application/PlanChangeService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeAuditLogRepository } from '../../auth/testDoubles';
import {
  FakeCampaignDowngradeHandler,
  FakeGroupBroadcastDowngradeHandler,
  FakeSessionDowngradeHandler,
} from '../fakes';

/**
 * Rotina de descida de plano (B5, etapa 3, spec §5.2) — reusada tanto por
 * `BillingService.syncFromStripe` (o Stripe avisou que a assinatura caiu)
 * quanto por `TenantControlService` (o `/admin` trocou o plano à mão).
 *
 * Desvio deliberado do texto da spec: `applyIfDowngrade` NUNCA escreve
 * `Tenant.plan` — recebe `from`/`to` de quem JÁ gravou o plano novo (os dois
 * chamadores já fazem isso, cada um com a auditoria própria de "o plano
 * mudou" — `BillingService`/`TenantControlService`). Se este serviço também
 * escrevesse o plano ou reauditasse a mudança, o `/admin` teria a origem
 * (`self_service`/`manual`) sobrescrita e o tenant ganharia DOIS registros de
 * "plano mudou" para a mesma mudança. `applyIfDowngrade` só cuida da
 * CONSEQUÊNCIA física da descida (sessões/campanhas) e da SUA PRÓPRIA
 * auditoria (`billing.plan_downgrade_applied`), nunca da mudança em si.
 */
function buildSut() {
  const auditLog = new FakeAuditLogRepository();
  const sessions = new FakeSessionDowngradeHandler();
  const campaigns = new FakeCampaignDowngradeHandler();
  const groupBroadcasts = new FakeGroupBroadcastDowngradeHandler();

  const service = new PlanChangeService(new NoopLogger(), auditLog);
  service.setSessionDowngradeHandler(sessions);
  service.setCampaignDowngradeHandler(campaigns);
  service.setGroupBroadcastDowngradeHandler(groupBroadcasts);

  return { service, auditLog, sessions, campaigns, groupBroadcasts };
}

describe('PlanChangeService.applyIfDowngrade', () => {
  it('plano MAIOR (subida): não chama nenhuma das três portas, nem audita', async () => {
    const { service, auditLog, sessions, campaigns, groupBroadcasts } = buildSut();

    await service.applyIfDowngrade('t1', 'broadcast', 'pro');

    expect(sessions.calls).toHaveLength(0);
    expect(campaigns.calls).toHaveLength(0);
    expect(groupBroadcasts.calls).toHaveLength(0);
    const page = await auditLog.listByTenant('t1', { limit: 10 });
    expect(page.entries).toHaveLength(0);
  });

  it('plano IGUAL: não faz nada', async () => {
    const { service, sessions } = buildSut();

    await service.applyIfDowngrade('t1', 'pro', 'pro');

    expect(sessions.calls).toHaveLength(0);
  });

  it('descida para free: chama as três portas com o limite do plano NOVO e audita a consequência', async () => {
    const { service, auditLog, sessions, campaigns, groupBroadcasts } = buildSut();

    await service.applyIfDowngrade('t1', 'enterprise', 'free');

    expect(sessions.calls).toEqual([{ tenantId: 't1', newLimit: 1 }]);
    expect(campaigns.calls).toEqual(['t1']);
    expect(groupBroadcasts.calls).toEqual(['t1']);

    const page = await auditLog.listByTenant('t1', { limit: 10 });
    expect(page.entries[0]).toMatchObject({
      action: 'billing.plan_downgrade_applied',
      metadata: { from: 'enterprise', to: 'free' },
    });
  });

  it('descida de enterprise para pro: o handler de sessão recebe o limite do plano NOVO (1), não zero', async () => {
    const { service, sessions } = buildSut();

    await service.applyIfDowngrade('t1', 'enterprise', 'pro');

    expect(sessions.calls).toEqual([{ tenantId: 't1', newLimit: 1 }]);
  });

  it('sem handlers injetados (ainda não vieram do index.ts): não lança', async () => {
    const service = new PlanChangeService(new NoopLogger());

    await expect(service.applyIfDowngrade('t1', 'enterprise', 'free')).resolves.toBeUndefined();
  });

  it('uma das portas lança: as outras duas ainda são chamadas', async () => {
    const { service, campaigns, groupBroadcasts } = buildSut();
    const sessions = new FakeSessionDowngradeHandler();
    sessions.detachExcessSessions = jest.fn().mockRejectedValue(new Error('boom'));
    service.setSessionDowngradeHandler(sessions);

    await expect(service.applyIfDowngrade('t1', 'enterprise', 'free')).resolves.toBeUndefined();

    expect(campaigns.calls).toEqual(['t1']);
    expect(groupBroadcasts.calls).toEqual(['t1']);
  });

  it('sem auditLog injetado: não lança', async () => {
    const service = new PlanChangeService(new NoopLogger());
    service.setSessionDowngradeHandler(new FakeSessionDowngradeHandler());

    await expect(service.applyIfDowngrade('t1', 'enterprise', 'free')).resolves.toBeUndefined();
  });
});
