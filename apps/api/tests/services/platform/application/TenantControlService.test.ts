import { TenantControlService } from '../../../../src/services/platform/application/TenantControlService';
import { TenantControlNoOpError } from '../../../../src/services/platform/domain/errors/TenantControlNoOpError';
import { TenantNotFoundError } from '../../../../src/services/platform/domain/errors/TenantNotFoundError';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakePlatformAuditLogRepository, fakeLogger } from '../testDoubles';

const CTX = { actorId: 'admin-1', ip: '10.0.0.9', userAgent: 'jest' };

function build() {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 't1', name: 'Cliente Um', apiKeyHash: null, plan: 'free', status: 'active' });
  const audit = new FakePlatformAuditLogRepository();
  const service = new TenantControlService(tenants, audit, fakeLogger());
  return { tenants, audit, service };
}

describe('TenantControlService', () => {
  describe('changePlan', () => {
    it('audita ANTES de escrever e devolve o tenant no plano novo', async () => {
      const { tenants, audit, service } = build();
      let auditedBeforeWrite = false;
      const realChangePlan = tenants.changePlan.bind(tenants);
      tenants.changePlan = async (id, plan) => {
        auditedBeforeWrite = audit.entries.length === 1;
        return realChangePlan(id, plan);
      };

      const result = await service.changePlan('t1', 'pro', CTX);

      expect(auditedBeforeWrite).toBe(true);
      expect(result.plan).toBe('pro');
      expect(audit.entries[0]).toMatchObject({
        platformUserId: 'admin-1',
        action: 'tenant.plan_changed',
        tenantId: 't1',
        metadata: { from: 'free', to: 'pro' },
        ip: '10.0.0.9',
        userAgent: 'jest',
      });
    });

    it('tenant inexistente → TenantNotFoundError, sem auditar', async () => {
      const { audit, service } = build();
      await expect(service.changePlan('nope', 'pro', CTX)).rejects.toBeInstanceOf(
        TenantNotFoundError,
      );
      expect(audit.entries).toHaveLength(0);
    });

    it('plano igual ao atual → TenantControlNoOpError, sem auditar nem escrever', async () => {
      const { audit, service } = build();
      await expect(service.changePlan('t1', 'free', CTX)).rejects.toBeInstanceOf(
        TenantControlNoOpError,
      );
      expect(audit.entries).toHaveLength(0);
    });
  });

  describe('suspend / reactivate', () => {
    it('suspend audita antes e grava status suspended', async () => {
      const { tenants, audit, service } = build();
      const result = await service.suspend('t1', CTX);

      expect(result.status).toBe('suspended');
      expect(audit.entries[0]).toMatchObject({
        action: 'tenant.suspended',
        tenantId: 't1',
        metadata: { from: 'active', to: 'suspended' },
      });
      expect((await tenants.findById('t1'))?.status).toBe('suspended');
    });

    it('suspender um tenant já suspenso → 409 no-op, sem nova entrada na trilha', async () => {
      const { audit, service } = build();
      await service.suspend('t1', CTX);
      await expect(service.suspend('t1', CTX)).rejects.toBeInstanceOf(TenantControlNoOpError);
      expect(audit.entries).toHaveLength(1);
    });

    it('reactivate volta o status para active e audita', async () => {
      const { audit, service } = build();
      await service.suspend('t1', CTX);
      const result = await service.reactivate('t1', CTX);

      expect(result.status).toBe('active');
      expect(audit.actions()).toEqual(['tenant.suspended', 'tenant.reactivated']);
    });

    it('reativar um tenant já ativo → 409 no-op', async () => {
      const { service } = build();
      await expect(service.reactivate('t1', CTX)).rejects.toBeInstanceOf(TenantControlNoOpError);
    });
  });
});
