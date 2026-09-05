import { randomUUID } from 'crypto';

import { PlatformUser } from '../../../src/services/platform/domain/entities/PlatformUser';
import { PlatformAuditEntry } from '../../../src/services/platform/domain/entities/PlatformAuditEntry';
import { PlatformUserRepository } from '../../../src/services/platform/domain/repositories/PlatformUserRepository';
import {
  PlatformAuditLogRepository,
  PlatformAuditPage,
} from '../../../src/services/platform/domain/repositories/PlatformAuditLogRepository';
import { AccountLockout, AccountLockoutStatus } from '../../../src/services/auth/domain/AccountLockout';
import { PasswordHasher } from '../../../src/services/auth/domain/PasswordHasher';
import { Logger } from '../../../src/shared/domain/Logger';

export class FakePlatformUserRepository implements PlatformUserRepository {
  readonly users: PlatformUser[] = [];
  touchCalls: Array<{ id: string; at: Date }> = [];
  /** Quando ligado, `touchLastLogin` explode — para provar que o login sobrevive. */
  failTouch = false;

  seed(overrides: Partial<PlatformUser> = {}): PlatformUser {
    const user: PlatformUser = {
      id: randomUUID(),
      email: 'dono@francis.app',
      passwordHash: 'hash-da-senha',
      name: 'Dono',
      status: 'active',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      ...overrides,
    };
    this.users.push(user);
    return user;
  }

  async findByEmail(email: string): Promise<PlatformUser | null> {
    return this.users.find((user) => user.email === email) ?? null;
  }

  async findById(id: string): Promise<PlatformUser | null> {
    return this.users.find((user) => user.id === id) ?? null;
  }

  async touchLastLogin(id: string, at: Date): Promise<void> {
    if (this.failTouch) throw new Error('banco indisponível');
    this.touchCalls.push({ id, at });
  }

  async create(user: Omit<PlatformUser, 'id' | 'createdAt' | 'lastLoginAt'>): Promise<PlatformUser> {
    return this.seed(user);
  }
}

export class FakePlatformAuditLogRepository implements PlatformAuditLogRepository {
  readonly entries: PlatformAuditEntry[] = [];
  failAppend = false;

  async append(entry: Omit<PlatformAuditEntry, 'id' | 'occurredAt'>): Promise<void> {
    if (this.failAppend) throw new Error('trilha indisponível');
    this.entries.push({ ...entry, id: randomUUID(), occurredAt: new Date() });
  }

  async listRecent(limit: number): Promise<PlatformAuditPage> {
    return { entries: this.entries.slice(0, limit) };
  }

  actions(): string[] {
    return this.entries.map((entry) => entry.action);
  }
}

/** Hash de mentirinha: a senha "confere" quando o hash é `hash:<senha>`. */
export class FakePasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `hash:${password}`;
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return hash === `hash:${password}`;
  }
}

export class FakeAccountLockout implements AccountLockout {
  locked = false;
  retryAfterMs = 60_000;
  failures: string[] = [];
  cleared: string[] = [];

  async status(): Promise<AccountLockoutStatus> {
    return this.locked
      ? { locked: true, retryAfterMs: this.retryAfterMs }
      : { locked: false, retryAfterMs: 0 };
  }

  async recordFailure(email: string): Promise<void> {
    this.failures.push(email);
  }

  async clear(email: string): Promise<void> {
    this.cleared.push(email);
  }
}

export function fakeLogger(): Logger {
  const logger: Logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: () => logger,
  };
  return logger;
}
