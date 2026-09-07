import type { PrismaClient, UserStatus as PrismaUserStatus } from '@prisma/client';

import { PlatformUser } from '../../domain/entities/PlatformUser';
import { PlatformUserRepository } from '../../domain/repositories/PlatformUserRepository';

interface PlatformUserRow {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/**
 * O enum do banco é MAIÚSCULO (`ACTIVE`/`SUSPENDED`) e o do Domain é
 * minúsculo — os dois mapas explicitam a tradução nos dois sentidos, mesmo
 * padrão de `PrismaUserRepository`.
 */
const STATUS_TO_PRISMA: Record<PlatformUser['status'], PrismaUserStatus> = {
  active: 'ACTIVE' as PrismaUserStatus,
  suspended: 'SUSPENDED' as PrismaUserStatus,
};

const PRISMA_TO_STATUS: Record<string, PlatformUser['status']> = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
};

/**
 * `status` chega do Prisma como o enum `user_status` (o MESMO já usado por
 * `User` — a migration reaproveita o tipo em vez de criar um segundo enum
 * com os mesmos dois valores). O mapeamento é explícito para a entidade de
 * Domain não depender do formato do banco.
 */
function toDomain(row: PlatformUserRow): PlatformUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    name: row.name,
    // Valor desconhecido cai para o lado SEGURO (suspenso) — nunca libera
    // acesso por causa de um enum que o código não reconhece.
    status: PRISMA_TO_STATUS[row.status] ?? 'suspended',
    lastLoginAt: row.lastLoginAt ?? undefined,
    createdAt: row.createdAt,
  };
}

/** Implementação Prisma de `PlatformUserRepository` (Fase 1 do `/admin`). */
export class PrismaPlatformUserRepository implements PlatformUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<PlatformUser | null> {
    // `email` é único global nesta tabela — quem normaliza é o Application
    // Service, então aqui a busca é por igualdade exata, sem `mode`.
    const row = await this.prisma.platformUser.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async findById(id: string): Promise<PlatformUser | null> {
    const row = await this.prisma.platformUser.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    // `updateMany` em vez de `update`: um id inexistente é um no-op silencioso
    // em vez de uma exceção. Último acesso é dado auxiliar — nunca pode ser o
    // motivo de um login legítimo falhar.
    await this.prisma.platformUser.updateMany({ where: { id }, data: { lastLoginAt: at } });
  }

  async create(
    user: Omit<PlatformUser, 'id' | 'createdAt' | 'lastLoginAt'>,
  ): Promise<PlatformUser> {
    const row = await this.prisma.platformUser.create({
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        name: user.name,
        status: STATUS_TO_PRISMA[user.status],
      },
    });
    return toDomain(row);
  }
}
