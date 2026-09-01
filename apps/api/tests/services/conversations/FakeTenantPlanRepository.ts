import { TenantPlan } from '../../../src/shared/tenant/domain/TenantPlan';
import { TenantPlanRepository } from '../../../src/services/conversations/domain/repositories/TenantPlanRepository';

/**
 * Fake de `TenantPlanRepository` (Trava de plano, Lançamento suave/2026-08-31).
 * `plan` começa `'pro'` — um tenant de teste é um cliente pagante a menos
 * que o teste diga o contrário (preserva o comportamento pré-Trava, em que
 * a IA sempre respondia). Testes do Plano Grátis chamam `setPlan('free')`.
 */
export class FakeTenantPlanRepository implements TenantPlanRepository {
  private plan: TenantPlan = 'pro';

  async getPlan(): Promise<TenantPlan> {
    return this.plan;
  }

  setPlan(plan: TenantPlan): void {
    this.plan = plan;
  }
}
