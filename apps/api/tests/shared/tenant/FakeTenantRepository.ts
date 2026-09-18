import { PlanSource } from '../../../src/shared/tenant/domain/PlanSource';
import { Tenant } from '../../../src/shared/tenant/domain/Tenant';
import { TenantPlan } from '../../../src/shared/tenant/domain/TenantPlan';
import { TenantRepository } from '../../../src/shared/tenant/domain/TenantRepository';
import { TenantStatus } from '../../../src/shared/tenant/domain/TenantStatus';

/**
 * Fake compartilhado do `TenantRepository` — em memória, sem Prisma/Postgres.
 * Reaproveitável por qualquer teste fora de `shared/tenant` (ex.:
 * `WhatsAppSessionService`, middleware de auth) via import relativo.
 *
 * TRAVA DE PLANO (2026-08-31): `seed(...)` aceita `plan` opcional e, quando
 * omitido, assume `'pro'` — um tenant de teste é um cliente pagante a menos
 * que o teste diga o contrário. Isso preserva o comportamento pré-plano
 * (antes da Trava a IA sempre respondia); só os testes que exercitam
 * especificamente o Plano Grátis passam `plan: 'free'` explicitamente.
 * `create(...)` devolve `'free'` — simula um tenant novo de verdade
 * (`Tenant.plan` = `@default(FREE)` no banco).
 *
 * ORIGEM DO PLANO (B5, 2026-09-18): omitida no `seed`, segue a mesma regra da
 * migration que criou a coluna — pago nasce `'manual'`, Grátis nasce
 * `'self_service'`.
 */
export class FakeTenantRepository implements TenantRepository {
  private tenants = new Map<string, Tenant>();

  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) ?? null;
  }

  async findByApiKeyHash(hash: string): Promise<Tenant | null> {
    return Array.from(this.tenants.values()).find((t) => t.apiKeyHash === hash) ?? null;
  }

  async create(input: { name: string }): Promise<Tenant> {
    const tenant: Tenant = {
      id: `tenant-${this.tenants.size + 1}`,
      name: input.name,
      apiKeyHash: null,
      plan: 'free',
      planSource: 'self_service',
      status: 'active',
    };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  async update(id: string, changes: { name: string }): Promise<Tenant | undefined> {
    return this.patch(id, { name: changes.name });
  }

  async changePlan(id: string, plan: TenantPlan, source: PlanSource): Promise<Tenant | undefined> {
    return this.patch(id, { plan, planSource: source });
  }

  async setStatus(id: string, status: TenantStatus): Promise<Tenant | undefined> {
    return this.patch(id, { status });
  }

  private patch(id: string, changes: Partial<Tenant>): Tenant | undefined {
    const existing = this.tenants.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...changes };
    this.tenants.set(id, updated);
    return updated;
  }

  /**
   * Helper de teste, não faz parte da interface de produção. `plan` é
   * opcional — omitido, assume `'pro'` (ver docstring da classe).
   */
  seed(
    tenant: Omit<Tenant, 'plan' | 'status' | 'planSource'> & {
      plan?: TenantPlan;
      status?: TenantStatus;
      planSource?: PlanSource;
    },
  ): void {
    const plan = tenant.plan ?? 'pro';
    this.tenants.set(tenant.id, {
      ...tenant,
      plan,
      planSource: tenant.planSource ?? (plan === 'free' ? 'self_service' : 'manual'),
      status: tenant.status ?? 'active',
    });
  }
}
