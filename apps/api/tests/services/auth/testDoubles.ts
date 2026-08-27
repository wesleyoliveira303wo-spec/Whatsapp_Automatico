import { randomUUID } from 'crypto';
import { User } from '../../../src/services/auth/domain/entities/User';
import { RefreshToken } from '../../../src/services/auth/domain/entities/RefreshToken';
import { AuditLog } from '../../../src/services/auth/domain/entities/AuditLog';
import {
  ListUsersOptions,
  NewUser,
  UserPage,
  UserRepository,
  UserUpdate,
} from '../../../src/services/auth/domain/repositories/UserRepository';
import {
  NewRefreshToken,
  RefreshTokenRepository,
} from '../../../src/services/auth/domain/repositories/RefreshTokenRepository';
import {
  AuditLogPage,
  AuditLogRepository,
  ListAuditLogsOptions,
  NewAuditLog,
} from '../../../src/services/auth/domain/repositories/AuditLogRepository';

/**
 * Fakes em memoria dos ports de `services/auth` (Milestone 5, Bloco M5A) —
 * sem Prisma/Postgres. Fieis aos contratos (unicidade de email por tenant,
 * revogacao, paginacao por cursor) para que os testes dos blocos M5B/M5C que
 * dependem deles reflitam o comportamento real. Mesmo espirito de
 * `FakeConversationRepository`/`FakeAnalyticsRepository`.
 */
export class FakeUserRepository implements UserRepository {
  private users: User[] = [];

  async create(input: NewUser): Promise<User> {
    if (this.users.some((u) => u.tenantId === input.tenantId && u.email === input.email)) {
      throw new Error(`Usuario ja existe: ${input.tenantId}/${input.email}`);
    }
    const now = new Date();
    const user: User = { id: randomUUID(), createdAt: now, updatedAt: now, ...input };
    this.users.push(user);
    return { ...user };
  }

  async findById(id: string): Promise<User | null> {
    const user = this.users.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async findByTenantAndEmail(tenantId: string, email: string): Promise<User | null> {
    const user = this.users.find((u) => u.tenantId === tenantId && u.email === email);
    return user ? { ...user } : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = this.users.find((u) => u.email === email);
    return user ? { ...user } : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    return this.users.some((u) => u.email === email);
  }

  async update(id: string, changes: UserUpdate): Promise<User | undefined> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return undefined;
    if (changes.passwordHash !== undefined) user.passwordHash = changes.passwordHash;
    if (changes.role !== undefined) user.role = changes.role;
    if (changes.status !== undefined) user.status = changes.status;
    if (changes.lastLoginAt !== undefined) user.lastLoginAt = changes.lastLoginAt;
    if (changes.mustChangePassword !== undefined)
      user.mustChangePassword = changes.mustChangePassword;
    user.updatedAt = new Date();
    return { ...user };
  }

  async listByTenant(tenantId: string, options: ListUsersOptions): Promise<UserPage> {
    const filtered = this.users
      .filter((u) => u.tenantId === tenantId)
      .filter((u) => (options.status ? u.status === options.status : true))
      .filter((u) => (options.role ? u.role === options.role : true))
      .sort((a, b) => {
        const byTime = b.createdAt.getTime() - a.createdAt.getTime();
        return byTime !== 0 ? byTime : a.id < b.id ? 1 : -1;
      });

    const startIndex = options.cursor ? filtered.findIndex((u) => u.id === options.cursor) + 1 : 0;
    const slice = filtered.slice(startIndex, startIndex + options.limit + 1);
    const hasMore = slice.length > options.limit;
    const page = hasMore ? slice.slice(0, options.limit) : slice;
    return {
      users: page.map((u) => ({ ...u })),
      nextCursor: hasMore ? page[page.length - 1].id : undefined,
    };
  }

  /** Helper de teste (nao faz parte do contrato de producao). */
  seed(user: User): void {
    this.users.push(user);
  }
}

export class FakeRefreshTokenRepository implements RefreshTokenRepository {
  private tokens: RefreshToken[] = [];

  async create(input: NewRefreshToken): Promise<RefreshToken> {
    const token: RefreshToken = { id: randomUUID(), createdAt: new Date(), ...input };
    this.tokens.push(token);
    return { ...token };
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const token = this.tokens.find((t) => t.tokenHash === tokenHash);
    return token ? { ...token } : null;
  }

  async revokeById(id: string): Promise<void> {
    const token = this.tokens.find((t) => t.id === id && t.revokedAt === undefined);
    if (token) token.revokedAt = new Date();
  }

  async revokeAllByUser(userId: string): Promise<void> {
    for (const token of this.tokens) {
      if (token.userId === userId && token.revokedAt === undefined) {
        token.revokedAt = new Date();
      }
    }
  }

  async purgeExpiredForUser(userId: string, olderThan: Date): Promise<number> {
    const before = this.tokens.length;
    this.tokens = this.tokens.filter(
      (t) => !(t.userId === userId && t.expiresAt.getTime() < olderThan.getTime()),
    );
    return before - this.tokens.length;
  }

  /** Helper de teste. */
  all(): RefreshToken[] {
    return this.tokens.map((t) => ({ ...t }));
  }
}

export class FakeAuditLogRepository implements AuditLogRepository {
  private entries: AuditLog[] = [];

  async record(input: NewAuditLog): Promise<AuditLog> {
    const entry: AuditLog = { id: randomUUID(), occurredAt: new Date(), ...input };
    this.entries.push(entry);
    return { ...entry };
  }

  async listByTenant(tenantId: string, options: ListAuditLogsOptions): Promise<AuditLogPage> {
    const filtered = this.entries
      .filter((e) => e.tenantId === tenantId)
      .filter((e) => (options.actorUserId ? e.actorUserId === options.actorUserId : true))
      .filter((e) => (options.action ? e.action === options.action : true))
      .sort((a, b) => {
        const byTime = b.occurredAt.getTime() - a.occurredAt.getTime();
        return byTime !== 0 ? byTime : a.id < b.id ? 1 : -1;
      });

    const startIndex = options.cursor ? filtered.findIndex((e) => e.id === options.cursor) + 1 : 0;
    const slice = filtered.slice(startIndex, startIndex + options.limit + 1);
    const hasMore = slice.length > options.limit;
    const page = hasMore ? slice.slice(0, options.limit) : slice;
    const nextCursor = hasMore ? page[page.length - 1].id : undefined;
    return { entries: page.map((e) => ({ ...e })), nextCursor };
  }

  /** Helper de teste. */
  all(): AuditLog[] {
    return this.entries.map((e) => ({ ...e }));
  }
}

/**
 * Fake de `PasswordHasher` (Milestone 5, Bloco M5C) — deterministico e rapido
 * (o scrypt real e lento de proposito; nos testes de AuthService nao queremos
 * pagar esse custo). Formato: `hashed:<senha>`.
 */
export class FakePasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return `hashed:${plainPassword}`;
  }

  async verify(plainPassword: string, storedHash: string): Promise<boolean> {
    return storedHash === `hashed:${plainPassword}`;
  }
}
