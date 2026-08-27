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

  async create(input: { name: string }): Promise<Tenant> {
    const tenant: Tenant = { id: `tenant-${this.tenants.size + 1}`, name: input.name, apiKeyHash: null };
    this.tenants.set(tenant.id, tenant);
    return tenant;
  }

  async update(id: string, changes: { name: string }): Promise<Tenant | undefined> {
    const existing = this.tenants.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, name: changes.name };
    this.tenants.set(id, updated);
    return updated;
  }

  /** Helper de teste, não faz parte da interface de produção. */
  seed(tenant: Tenant): void {
    this.tenants.set(tenant.id, tenant);
  }
}
