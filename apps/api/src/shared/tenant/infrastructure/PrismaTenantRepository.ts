import type {
  PrismaClient,
  TenantPlan as PrismaTenantPlan,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';

import { Tenant } from '../domain/Tenant';
import { TenantPlan } from '../domain/TenantPlan';
import { TenantRepository } from '../domain/TenantRepository';
import { TenantStatus } from '../domain/TenantStatus';

/**
 * Mapa enum do banco (SCREAMING) -> união literal do Domain (lowercase),
 * mesmo padrão de `STAGE_TO_DOMAIN`/`UserRole` no resto do projeto.
 */
const PLAN_TO_DOMAIN: Record<PrismaTenantPlan, TenantPlan> = {
  FREE: 'free',
  PRO: 'pro',
  ENTERPRISE: 'enterprise',
};

const PLAN_TO_PRISMA: Record<TenantPlan, PrismaTenantPlan> = {
  free: 'FREE',
  pro: 'PRO',
  enterprise: 'ENTERPRISE',
};

/**
 * `status` do `Tenant` reaproveita o enum Prisma `UserStatus` (`user_status`),
 * ver migration `20260906120000_add_tenant_status` e §8 do plano mestre.
 */
const STATUS_TO_DOMAIN: Record<PrismaUserStatus, TenantStatus> = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
};

const STATUS_TO_PRISMA: Record<TenantStatus, PrismaUserStatus> = {
  active: 'ACTIVE',
  suspended: 'SUSPENDED',
};

/**
 * Shape mínimo lido do banco — só os campos que `Tenant` (Domain) de fato usa
 * (mesmo racional de `WhatsAppSessionRow` em `PrismaWhatsAppSessionRepository.ts`).
 */
interface TenantRow {
  id: string;
  name: string;
  apiKeyHash: string | null;
  plan: PrismaTenantPlan;
  status: PrismaUserStatus;
}

function toDomain(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    apiKeyHash: row.apiKeyHash,
    plan: PLAN_TO_DOMAIN[row.plan],
    status: STATUS_TO_DOMAIN[row.status],
  };
}

/**
 * Implementação concreta de `TenantRepository` sobre o model `Tenant`
 * (`prisma/schema.prisma`). Leitura (Production Hardening, Bloco 1) + as duas
 * escritas cross-tenant da Fase 4 do `/admin` (`changePlan`/`setStatus`),
 * ambas no mesmo padrão de `update`: `updateMany` escopado por `id` + re-find,
 * devolvendo `undefined` quando o id não existe.
 */
export class PrismaTenantRepository implements TenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByApiKeyHash(hash: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { apiKeyHash: hash } });
    return row ? toDomain(row) : null;
  }

  async create(input: { name: string }): Promise<Tenant> {
    const row = await this.prisma.tenant.create({ data: { name: input.name } });
    return toDomain(row);
  }

  async update(id: string, changes: { name: string }): Promise<Tenant | undefined> {
    return this.applyUpdate(id, { name: changes.name });
  }

  async changePlan(id: string, plan: TenantPlan): Promise<Tenant | undefined> {
    return this.applyUpdate(id, { plan: PLAN_TO_PRISMA[plan] });
  }

  async setStatus(id: string, status: TenantStatus): Promise<Tenant | undefined> {
    return this.applyUpdate(id, { status: STATUS_TO_PRISMA[status] });
  }

  private async applyUpdate(
    id: string,
    data: { name?: string; plan?: PrismaTenantPlan; status?: PrismaUserStatus },
  ): Promise<Tenant | undefined> {
    const result = await this.prisma.tenant.updateMany({ where: { id }, data });
    if (result.count === 0) {
      return undefined;
    }
    return (await this.findById(id)) ?? undefined;
  }
}
