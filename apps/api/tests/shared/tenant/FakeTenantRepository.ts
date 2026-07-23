import { Tenant } from '../../../src/shared/tenant/domain/Tenant';
import { TenantRepository } from '../../../src/shared/tenant/domain/TenantRepository';

/**
 * Fake compartilhado do `TenantRepository` — em memória, sem Prisma/Postgres.
 * Reaproveitável por qualquer teste fora de `shared/tenant` (ex.:
 * `WhatsAppSessionService`, middleware de auth) via import relativo.
 */
export class FakeTenantRepository implements TenantRepository {
  private tenants = new Map<string, Tenant>();

  async findById(id: string): Promise<Tenant | null> {
    return this.tenants.get(id) ?? null;
  }

  async findByApiKeyHash(hash: string): Promise<Tenant | null> {
    return Array.from(this.tenants.values()).find((t) => t.apiKeyHash === hash) ?? null;
  }

  /** Helper de teste, não faz parte da interface de produção. */
  seed(tenant: Tenant): void {
    this.tenants.set(tenant.id, tenant);
  }
}
