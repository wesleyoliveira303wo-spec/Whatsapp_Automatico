import type { PrismaClient } from '@prisma/client';

import { Tenant } from '../domain/Tenant';
import { TenantRepository } from '../domain/TenantRepository';

/**
 * Shape mínimo lido do banco — só os campos que `Tenant` (Domain) de fato usa
 * (mesmo racional de `WhatsAppSessionRow` em `PrismaWhatsAppSessionRepository.ts`).
 */
interface TenantRow {
  id: string;
  name: string;
  apiKeyHash: string | null;
}

function toDomain(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    apiKeyHash: row.apiKeyHash,
  };
}

/**
 * Implementação concreta de `TenantRepository` sobre o model `Tenant`
 * (`prisma/schema.prisma`). Production Hardening, Bloco 1 — só os dois
 * finders exigidos pela porta, sem escrita (ver docstring de
 * `TenantRepository.ts`).
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
    const result = await this.prisma.tenant.updateMany({
      where: { id },
      data: { name: changes.name },
    });
    if (result.count === 0) {
      return undefined;
    }
    return (await this.findById(id)) ?? undefined;
  }
}
