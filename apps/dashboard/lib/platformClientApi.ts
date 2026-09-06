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
