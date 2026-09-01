import { TenantPlan } from '../../../../shared/tenant/domain/TenantPlan';
import { TenantRepository } from '../../../../shared/tenant/domain/TenantRepository';
import { TenantPlanRepository } from '../../domain/repositories/TenantPlanRepository';

/**
 * Adapter de `TenantPlanRepository` (Lançamento suave, 2026-08-31) — envolve
 * o `TenantRepository` compartilhado de `shared/tenant`. Nenhuma consulta
 * nova ao banco além do `findById` que aquele repositório já faz; só reduz a
 * superfície para o único dado que os consumidores precisam (`plan`).
 */
export class TenantPlanFromTenantRepository implements TenantPlanRepository {
  constructor(private readonly tenantRepository: TenantRepository) {}

  async getPlan(tenantId: string): Promise<TenantPlan> {
    const tenant = await this.tenantRepository.findById(tenantId);
    return tenant?.plan ?? 'free';
  }
}
