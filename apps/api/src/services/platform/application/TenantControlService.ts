import { Logger } from '../../../shared/domain/Logger';
import { Tenant } from '../../../shared/tenant/domain/Tenant';
import { TenantPlan } from '../../../shared/tenant/domain/TenantPlan';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { PlatformAuditLogRepository } from '../domain/repositories/PlatformAuditLogRepository';
import { TenantControlNoOpError } from '../domain/errors/TenantControlNoOpError';
import { TenantNotFoundError } from '../domain/errors/TenantNotFoundError';

/**
 * Quem está agindo e de onde — o que a trilha da plataforma precisa além do
 * alvo e da ação.
 */
export interface TenantControlContext {
  actorId: string;
  ip?: string;
  userAgent?: string;
}

/**
 * Controle do tenant — Fase 4 do `/admin` (`ADMIN_PLATFORM_MASTER_PLAN.md`
 * §8). PRIMEIRA escrita cross-tenant do projeto.
 *
 * Regra da fase, testada explicitamente (§15): **toda ação é auditada ANTES
 * de ser executada**. `append` da trilha vem primeiro; só depois o
 * `TenantRepository` escreve. Se a escrita falhar, fica um registro de
 * "tentou" — preferível a uma escrita sem rastro.
 *
 * Um no-op (suspender quem já está suspenso, plano igual ao atual) é um ERRO
 * (`TenantControlNoOpError` → 409), não um sucesso silencioso: a trilha só
 * registra mudança real.
 *
 * Sem regra de FRICÇÃO aqui — a confirmação proporcional (§12) é da UI. O que
 * o backend garante é que a rota exige sessão de plataforma e que não há
 * atalho: nenhum parâmetro "forçar", nenhuma rota alternativa sem porteiro.
 */
export class TenantControlService {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly auditLog: PlatformAuditLogRepository,
    private readonly logger: Logger,
  ) {}

  async changePlan(
    tenantId: string,
    plan: TenantPlan,
    context: TenantControlContext,
  ): Promise<Tenant> {
    const tenant = await this.requireTenant(tenantId);
    if (tenant.plan === plan) {
      throw new TenantControlNoOpError(`O tenant ${tenantId} já está no plano ${plan}.`);
    }

    await this.auditLog.append({
      platformUserId: context.actorId,
      action: 'tenant.plan_changed',
      tenantId,
      metadata: { from: tenant.plan, to: plan },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const updated = await this.tenants.changePlan(tenantId, plan);
    return this.requireUpdated(tenantId, updated, 'plan_changed');
  }

  async suspend(tenantId: string, context: TenantControlContext): Promise<Tenant> {
    const tenant = await this.requireTenant(tenantId);
    if (tenant.status === 'suspended') {
      throw new TenantControlNoOpError(`O tenant ${tenantId} já está suspenso.`);
    }

    await this.auditLog.append({
      platformUserId: context.actorId,
      action: 'tenant.suspended',
      tenantId,
      metadata: { from: tenant.status, to: 'suspended' },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const updated = await this.tenants.setStatus(tenantId, 'suspended');
    return this.requireUpdated(tenantId, updated, 'suspended');
  }

  async reactivate(tenantId: string, context: TenantControlContext): Promise<Tenant> {
    const tenant = await this.requireTenant(tenantId);
    if (tenant.status === 'active') {
      throw new TenantControlNoOpError(`O tenant ${tenantId} já está ativo.`);
    }

    await this.auditLog.append({
      platformUserId: context.actorId,
      action: 'tenant.reactivated',
      tenantId,
      metadata: { from: tenant.status, to: 'active' },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    const updated = await this.tenants.setStatus(tenantId, 'active');
    return this.requireUpdated(tenantId, updated, 'reactivated');
  }

  private async requireTenant(tenantId: string): Promise<Tenant> {
    const tenant = await this.tenants.findById(tenantId);
    if (!tenant) {
      throw new TenantNotFoundError(tenantId);
    }
    return tenant;
  }

  private requireUpdated(
    tenantId: string,
    updated: Tenant | undefined,
    action: string,
  ): Tenant {
    if (!updated) {
      // Corrida rara: tenant sumiu entre a leitura e a escrita. A trilha já
      // registrou a intenção; o chamador recebe 404.
      this.logger.warn('Tenant sumiu durante uma ação de controle', { tenantId, action });
      throw new TenantNotFoundError(tenantId);
    }
    return updated;
  }
}
