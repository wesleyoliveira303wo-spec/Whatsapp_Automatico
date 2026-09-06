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

// --- Fase 2/3 — observabilidade ---

import { TenantOverview } from '../../../src/services/platform/domain/entities/TenantOverview';
import { TenantDetail } from '../../../src/services/platform/domain/entities/TenantDetail';
import { PlatformTotals } from '../../../src/services/platform/domain/entities/PlatformTotals';
import {
  ObservabilityRange,
  TenantObservabilityRepository,
} from '../../../src/services/platform/domain/repositories/TenantObservabilityRepository';

export function tenantOverview(patch: Partial<TenantOverview> = {}): TenantOverview {
  return {
    id: 't',
    name: 'Cliente',
    plan: 'free',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    sessionCount: 1,
    connectedSessionCount: 1,
    userCount: 1,
    lastActivityAt: new Date('2026-09-06T10:00:00Z'),
    messages30d: { inbound: 100, outbound: 100 },
    ai30d: { total: 10, success: 10, providerError: 0, validationRejected: 0, costUsd: '0' },
    conversations30d: { total: 10, escalated: 0 },
    aiProfileConfigured: true,
    ...patch,
  };
}

export function emptyPlatformTotals(patch: Partial<PlatformTotals> = {}): PlatformTotals {
  return {
    tenants: { total: 0, byPlan: { free: 0, pro: 0, enterprise: 0 } },
    users: 0,
    sessions: { total: 0, connected: 0 },
    messages30d: { inbound: 0, outbound: 0 },
    ai30d: { total: 0, success: 0, providerError: 0, validationRejected: 0, costUsd: '0' },
    campaigns: { running: 0, pausedByBreaker: 0 },
    ...patch,
  };
}

/** Fake do repositório de observabilidade — cobre Fase 2 e Fase 3. */
export class FakeTenantObservabilityRepository implements TenantObservabilityRepository {
  lastRange: ObservabilityRange | null = null;
  allSessions: Array<{ tenantId: string; sessionName: string; status: string }> = [];
  totals: PlatformTotals = emptyPlatformTotals();

  constructor(
    public overviews: TenantOverview[] = [],
    private readonly detail: TenantDetail | null = null,
  ) {}

  async listTenantOverviews(range: ObservabilityRange): Promise<TenantOverview[]> {
    this.lastRange = range;
    return this.overviews.map((o) => ({ ...o }));
  }

  async getTenantDetail(tenantId: string, range: ObservabilityRange): Promise<TenantDetail | null> {
    this.lastRange = range;
    return this.detail && this.detail.id === tenantId ? this.detail : null;
  }

  async platformTotals(range: ObservabilityRange): Promise<PlatformTotals> {
    this.lastRange = range;
    return this.totals;
  }

  async listAllSessions(): Promise<
    Array<{ tenantId: string; sessionName: string; status: string }>
  > {
    return this.allSessions;
  }
}
