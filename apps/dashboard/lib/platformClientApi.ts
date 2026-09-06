import { PLATFORM_CSRF_COOKIE_NAME } from './platformSession';

/** Erro de uma chamada do `/admin` — carrega o status para a tela decidir o texto. */
export class PlatformApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Falha na chamada do painel (HTTP ${status})`);
    this.name = 'PlatformApiError';
  }
}

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
}

// --- Fase 2 — Centro de Tenants (`ADMIN_PLATFORM_MASTER_PLAN.md` §6) ---

export type TenantPlan = 'free' | 'pro' | 'enterprise';
/** Trava de acesso (Fase 4). `'suspended'` = o tenant inteiro não loga. */
export type TenantStatus = 'active' | 'suspended';
export type TenantSignalSeverity = 'red' | 'amber' | 'green';

export interface TenantSignal {
  key: string;
  severity: TenantSignalSeverity;
  label: string;
  reading: string;
}

export interface PlatformTenantRow {
  id: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
  /** ISO string. */
  createdAt: string;
  sessionCount: number;
  connectedSessionCount: number;
  userCount: number;
  /** ISO string ou null. */
  lastActivityAt: string | null;
  messages30d: { inbound: number; outbound: number };
  ai30d: {
    total: number;
    success: number;
    providerError: number;
    validationRejected: number;
    /** STRING decimal exata — nunca `Number()` (D46). */
    costUsd: string;
  };
  conversations30d: { total: number; escalated: number };
  aiProfileConfigured: boolean;
  signals: TenantSignal[];
}

export interface PlatformTenantDetail extends PlatformTenantRow {
  contactCount: number;
  campaigns: { total: number; running: number; paused: number; pausedByBreaker: number };
  sessions: Array<{
    sessionName: string;
    status: 'connecting' | 'connected' | 'disconnected';
    phoneNumber: string | null;
    lastSeen: string | null;
    aiProfileConfigured: boolean;
  }>;
  recentSessionEvents: Array<{
    sessionName: string;
    status: 'connecting' | 'connected' | 'disconnected';
    disconnectReason: string | null;
    occurredAt: string;
  }>;
}

/**
 * Lê o espelho legível do token CSRF do `/admin` — cookie PRÓPRIO, nunca o do
 * produto: as duas sessões podem coexistir no mesmo navegador (o fundador é
 * cliente da própria ferramenta), e devolver o token errado derrubaria as
 * requisições com 403.
 */
function csrfHeader(): Record<string, string> {
  if (typeof document === 'undefined') return {};
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${PLATFORM_CSRF_COOKIE_NAME}=([^;]*)`),
  );
  return match ? { 'x-csrf-token': decodeURIComponent(match[1]) } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method === 'GET' ? {} : csrfHeader()),
      ...init.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new PlatformApiError(response.status, body);
  }
  return body as T;
}

export async function platformLogin(email: string, password: string): Promise<PlatformAdmin> {
  const body = await request<{ user: PlatformAdmin }>('/api/platform/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return body.user;
}

export async function platformLogout(): Promise<void> {
  await request('/api/platform/logout', { method: 'POST' });
}

export async function fetchPlatformAdmin(): Promise<PlatformAdmin> {
  const body = await request<{ user: PlatformAdmin }>('/api/platform/me');
  return body.user;
}

export async function fetchPlatformTenants(): Promise<PlatformTenantRow[]> {
  const body = await request<{ tenants: PlatformTenantRow[] }>('/api/platform/tenants');
  return body.tenants;
}

export async function fetchPlatformTenantDetail(
  tenantId: string,
): Promise<PlatformTenantDetail> {
  const body = await request<{ tenant: PlatformTenantDetail }>(
    `/api/platform/tenants/${encodeURIComponent(tenantId)}`,
  );
  return body.tenant;
}

// --- Fase 4 — Controle (`ADMIN_PLATFORM_MASTER_PLAN.md` §8) ---

/** O tenant depois de uma ação de controle — só os campos que a ação mexe. */
export interface PlatformTenantControlResult {
  id: string;
  name: string;
  plan: TenantPlan;
  status: TenantStatus;
}

export async function changePlatformTenantPlan(
  tenantId: string,
  plan: TenantPlan,
): Promise<PlatformTenantControlResult> {
  const body = await request<{ tenant: PlatformTenantControlResult }>(
    `/api/platform/tenants/${encodeURIComponent(tenantId)}/plan`,
    { method: 'PATCH', body: JSON.stringify({ plan }) },
  );
  return body.tenant;
}

export async function suspendPlatformTenant(
  tenantId: string,
): Promise<PlatformTenantControlResult> {
  const body = await request<{ tenant: PlatformTenantControlResult }>(
    `/api/platform/tenants/${encodeURIComponent(tenantId)}/suspend`,
    { method: 'POST' },
  );
  return body.tenant;
}

export async function reactivatePlatformTenant(
  tenantId: string,
): Promise<PlatformTenantControlResult> {
  const body = await request<{ tenant: PlatformTenantControlResult }>(
    `/api/platform/tenants/${encodeURIComponent(tenantId)}/reactivate`,
    { method: 'POST' },
  );
  return body.tenant;
}

// --- Fase 3 — Início e Saúde ---

export interface ActionQueueItem {
  key: 'sessions_down' | 'tenants_at_risk' | 'campaigns_breaker' | 'never_started';
  severity: 'red' | 'amber';
  count: number;
  label: string;
  href: string;
}

export interface PlatformOverview {
  actionQueue: ActionQueueItem[];
  kpis: {
    tenants: { total: number; byPlan: Record<TenantPlan, number> };
    users: number;
    sessions: { total: number; connected: number };
    messages30d: { inbound: number; outbound: number };
    ai30d: {
      total: number;
      success: number;
      providerError: number;
      validationRejected: number;
      costUsd: string;
    };
    campaigns: { running: number; pausedByBreaker: number };
    tenantsHealthy: number;
    tenantsNeedingAttention: number;
    sessionsConnectedLive: number;
  };
}

export interface QueueDepth {
  name: string;
  reachable: boolean;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
}

export interface PlatformHealth {
  infra: {
    database: 'ok' | 'down';
    redis: 'ok' | 'down';
    queues: QueueDepth[];
  } | null;
  aiFailures30d: { total: number; providerError: number; rate: number | null };
  tenantsWithSessionsDown: number;
}

export async function fetchPlatformOverview(): Promise<PlatformOverview> {
  return request<PlatformOverview>('/api/platform/overview');
}

export async function fetchPlatformHealth(): Promise<PlatformHealth> {
  return request<PlatformHealth>('/api/platform/health');
}

// --- Fase 5 — Acesso assistido (lado ADMIN, seção Suporte §9.5) ---

export type SupportAccessStatus =
  | 'pending'
  | 'accepted'
  | 'denied'
  | 'expired'
  | 'revoked'
  | 'ended';

export interface PlatformSupportRequest {
  id: string;
  tenantId: string;
  platformUserId: string;
  reason: string;
  status: SupportAccessStatus;
  requestedAt: string;
  respondedAt: string | null;
  respondedByUserId: string | null;
  expiresAt: string | null;
}

export async function fetchSupportRequests(cursor?: string): Promise<{
  requests: PlatformSupportRequest[];
  nextCursor: string | null;
}> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return request(`/api/platform/support${qs}`);
}

export async function requestSupportAccess(
  tenantId: string,
  reason: string,
): Promise<{ request: PlatformSupportRequest }> {
  return request('/api/platform/support', {
    method: 'POST',
    body: JSON.stringify({ tenantId, reason }),
  });
}

export async function endSupportAccess(id: string): Promise<{ request: PlatformSupportRequest }> {
  return request(`/api/platform/support/${encodeURIComponent(id)}/end`, { method: 'POST' });
}

/** "Entrar na conta" — o BFF grava a sessão de suporte e o cliente navega para `/app`. */
export async function enterTenantAccount(supportAccessId: string): Promise<{ tenantId: string }> {
  return request('/api/admin/support/enter', {
    method: 'POST',
    body: JSON.stringify({ supportAccessId }),
  });
}
