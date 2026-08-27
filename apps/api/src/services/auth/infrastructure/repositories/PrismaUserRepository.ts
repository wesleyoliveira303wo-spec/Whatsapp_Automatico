import type {
  PrismaClient,
  Prisma,
  UserRole as PrismaUserRole,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';

import { User, UserRole, UserStatus } from '../../domain/entities/User';
import {
  ListUsersOptions,
  NewUser,
  UserPage,
  UserRepository,
  UserUpdate,
} from '../../domain/repositories/UserRepository';

/** Mapas uniao-literal (Domain) <-> enum (Prisma) — mesmo padrao de `PROVIDER_TO_PRISMA`/`DIRECTION_TO_PRISMA`. */
const ROLE_TO_PRISMA: Record<UserRole, PrismaUserRole> = {
  owner: 'OWNER' as PrismaUserRole,
  administrator: 'ADMINISTRATOR' as PrismaUserRole,
  manager: 'MANAGER' as PrismaUserRole,
  operator: 'OPERATOR' as PrismaUserRole,
  read_only: 'READ_ONLY' as PrismaUserRole,
};

const PRISMA_TO_ROLE: Record<string, UserRole> = {
  OWNER: 'owner',
  ADMINISTRATOR: 'administrator',
  MANAGER: 'manager',
  OPERATOR: 'operator',
  READ_ONLY: 'read_only',
};

const STATUS_TO_PRISMA: Record<UserStatus, PrismaUserStatus> = {
  active: 'ACTIVE' as PrismaUserStatus,
  suspended: 'SUSPENDED' as PrismaUserStatus,
};

const PRISMA_TO_STATUS: Record<string, UserStatus> = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
};

/**
 * Shape minimo lido do banco — so os campos que este repositorio de fato le
 * de volta (mesmo racional dos demais `Prisma*Repository`: nao depender do
 * tipo completo gerado pelo Prisma, que fica corrompido no sandbox — ADR #56).
 */
interface UserRow {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  lastLoginAt: Date | null;
  mustChangePassword?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toDomain(row: UserRow): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    passwordHash: row.passwordHash,
    role: PRISMA_TO_ROLE[row.role] ?? 'read_only',
    status: PRISMA_TO_STATUS[row.status] ?? 'suspended',
    lastLoginAt: row.lastLoginAt ?? undefined,
    mustChangePassword: row.mustChangePassword ?? false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Implementacao Prisma de `UserRepository` — Milestone 5, Bloco M5A. So
 * persistencia (nenhuma regra de negocio; validacao de tenant/permissao e
 * senha ficam na Application, M5B/M5C). `import type` do client (disciplina
 * da ADR #56): nada do Prisma e importado como VALOR aqui.
 */
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: NewUser): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        tenantId: input.tenantId,
        email: input.email,
        passwordHash: input.passwordHash,
        role: ROLE_TO_PRISMA[input.role],
        status: STATUS_TO_PRISMA[input.status],
        lastLoginAt: input.lastLoginAt ?? null,
        mustChangePassword: input.mustChangePassword ?? false,
      },
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByTenantAndEmail(tenantId: string, email: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where: { tenantId, email } });
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email } });
    return row ? toDomain(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    return row !== null;
  }

  async listByTenant(tenantId: string, options: ListUsersOptions): Promise<UserPage> {
    // `take: limit + 1` — le uma linha a mais so para saber se existe proxima
    // pagina, sem um COUNT separado (mesma tecnica de
    // `PrismaAuditLogRepository.listByTenant` / `PrismaConversationRepository`).
    const rows = await this.prisma.user.findMany({
      where: {
        tenantId,
        ...(options.status ? { status: STATUS_TO_PRISMA[options.status] } : {}),
        ...(options.role ? { role: ROLE_TO_PRISMA[options.role] } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: options.limit + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;
    return {
      users: page.map(toDomain),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }

  async update(id: string, changes: UserUpdate): Promise<User | undefined> {
    // `updateMany` + `findById` (em vez de `update`, que lanca P2025 se nao
    // existir) para devolver `undefined` no lugar de excecao — mesmo padrao de
    // `PrismaConversationRepository.updateStatus`.
    const data: Prisma.UserUpdateManyMutationInput = {};
    if (changes.passwordHash !== undefined) data.passwordHash = changes.passwordHash;
    if (changes.role !== undefined) data.role = ROLE_TO_PRISMA[changes.role];
    if (changes.status !== undefined) data.status = STATUS_TO_PRISMA[changes.status];
    if (changes.lastLoginAt !== undefined) data.lastLoginAt = changes.lastLoginAt;
    if (changes.mustChangePassword !== undefined)
      data.mustChangePassword = changes.mustChangePassword;

    const result = await this.prisma.user.updateMany({ where: { id }, data });
    if (result.count === 0) {
      return undefined;
    }
    const updated = await this.findById(id);
    return updated ?? undefined;
  }
}
