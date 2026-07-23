/**
 * Cliente HTTP do BROWSER (M2, Fase 4 — UI) para as rotas proxy do próprio
 * Dashboard (`pages/api/*`, Fase 3 — BFF), nunca para `apps/api`
 * diretamente — o browser não conhece `API_BASE_URL` nem a API key do
 * tenant, ambos ficam só no servidor (ver `lib/apiClient.ts`). Todas as
 * chamadas aqui são para paths relativos (mesma origem), então o cookie
 * `wa_dashboard_session` (httpOnly) é enviado automaticamente pelo browser —
 * este módulo nunca lê nem manipula esse cookie.
 *
 * Tipos espelham exatamente os DTOs que `apps/api` serializa em JSON
 * (`WhatsAppSession`, `WhatsAppSessionDetails`, `WhatsAppSessionEvent` —
 * ver `apps/api/src/services/whatsapp/domain/entities/*` e
 * `application/WhatsAppSessionService.ts`). Datas chegam como `string` ISO
 * 8601 (serialização padrão de `Date` via `JSON.stringify`), nunca como
 * `Date` de verdade — por isso os campos de data aqui são `string`, não
 * `Date`.
 */

export type WhatsAppSessionStatus = 'connected' | 'disconnected' | 'connecting';

export type WhatsAppDisconnectReason = 'logged_out' | 'restart_required' | 'connection_lost' | 'timed_out' | 'unknown';

export interface WhatsAppSessionSummary {
  id: string;
  tenantId: string;
  sessionName: string;
  provider: 'baileys';
  status: WhatsAppSessionStatus;
  disconnectReason?: WhatsAppDisconnectReason;
  phoneNumber?: string;
  connectedAt?: string;
  lastSeen?: string;
  createdAt: string;
  updatedAt: string;
}

/** DTO de `GET /api/sessions/:sessionName` — `WhatsAppSessionSummary` + `generation` (só existe enquanto a instância de `SessionManager` está viva no Registry; ver `WhatsAppSessionDetails` em `apps/api`). */
export interface WhatsAppSessionDetail extends WhatsAppSessionSummary {
  generation: number;
}

export interface WhatsAppSessionEvent {
  id: string;
  tenantId: string;
  sessionName: string;
  status: WhatsAppSessionStatus;
  disconnectReason?: WhatsAppDisconnectReason;
  occurredAt: string;
}

/** Erro lançado por `request()` para respostas HTTP não-2xx — carrega `status` e o corpo já decodificado (quando existir), para que quem chamar decida como exibir (mensagem de validação, "não autenticado", etc.) sem precisar re-parsear nada. */
export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Requisição falhou com status ${status}`);
    this.name = 'ClientApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    throw new ClientApiError(response.status, body);
  }
  return body as T;
}

export function login(tenantId: string, apiKey: string): Promise<{ tenantId: string }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ tenantId, apiKey }) });
}

/** Usuario logado, como o BFF devolve em login (modo pessoa) e em /me — Milestone 5, Bloco M5F. */
export interface SessionUserInfo {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
}

/** Login de PESSOA (M5F-2): e-mail + senha. `user.mustChangePassword: true` = a tela deve levar para /change-password antes de qualquer outra coisa. */
export function loginWithPassword(
  tenantId: string,
  email: string,
  password: string,
): Promise<{ tenantId: string; user: SessionUserInfo }> {
  return request('/api/auth/login', { method: 'POST', body: JSON.stringify({ tenantId, email, password }) });
}

/** Troca da propria senha (M5F-2). O BFF reloga sozinho — depois do 204 a sessao continua valida. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}

/** Quem sou eu (M5F-2): `user: null` = sessao de API key (comportamento pre-M5F). */
export function fetchMe(): Promise<{ tenantId: string; user: SessionUserInfo | null }> {
  return request('/api/auth/me');
}

export function logout(): Promise<void> {
  return request('/api/auth/logout', { method: 'POST' });
}

// --- Gestao de usuarios (Milestone 5, Bloco M5F-3 — o "RH") ---

export type ManagedUserRole = 'owner' | 'administrator' | 'manager' | 'operator' | 'read_only';
export type ManagedUserStatus = 'active' | 'suspended';

/** DTO de usuario como a API devolve (PublicUser serializado — sem passwordHash, datas como string ISO). */
export interface ManagedUser {
  id: string;
  tenantId: string;
  email: string;
  role: ManagedUserRole;
  status: ManagedUserStatus;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManagedUserPage {
  users: ManagedUser[];
  nextCursor?: string;
}

export function fetchUsers(params: { limit?: number; cursor?: string } = {}): Promise<ManagedUserPage> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const suffix = query.toString();
  return request(`/api/users${suffix ? `?${suffix}` : ''}`);
}

export function createUser(email: string, role: ManagedUserRole, temporaryPassword: string): Promise<{ user: ManagedUser }> {
  return request('/api/users', { method: 'POST', body: JSON.stringify({ email, role, temporaryPassword }) });
}

export function changeUserRole(userId: string, role: ManagedUserRole): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });
}

export function suspendUser(userId: string): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/suspend`, { method: 'POST' });
}

export function reactivateUser(userId: string): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/reactivate`, { method: 'POST' });
}

export function resetUserPassword(userId: string, temporaryPassword: string): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ temporaryPassword }),
  });
}

// --- Base de Conhecimento (Nível 1 — o "Cérebro da IA") ---

/** DTO do perfil de negócio como a API serializa. `null` quando nunca configurado. Data como string ISO. */
export interface AiBusinessProfile {
  tenantId: string;
  content: string;
  updatedAt: string;
}

/** Lê o perfil do tenant. `profile: null` = ainda não configurado (a UI mostra o textarea vazio). */
export function fetchAiProfile(): Promise<{ profile: AiBusinessProfile | null }> {
  return request('/api/ai-profile');
}

/** Salva (upsert) o texto do perfil. `content` vazio apaga o "cérebro" (a IA volta ao comportamento genérico). */
export function saveAiProfile(content: string): Promise<{ profile: AiBusinessProfile }> {
  return request('/api/ai-profile', { method: 'PUT', body: JSON.stringify({ content }) });
}

export function fetchSessions(): Promise<{ sessions: WhatsAppSessionSummary[] }> {
  return request('/api/sessions');
}

export function connectSession(sessionName: string): Promise<WhatsAppSessionSummary> {
  return request('/api/sessions', { method: 'POST', body: JSON.stringify({ sessionName }) });
}

export function fetchSessionDetail(sessionName: string): Promise<WhatsAppSessionDetail> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}`);
}

export function disconnectSession(sessionName: string): Promise<void> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: 'DELETE' });
}

export function removeSession(sessionName: string): Promise<void> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/remove`, { method: 'DELETE' });
}

export function fetchQrCode(sessionName: string): Promise<{ qrCode: string }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/qrcode`);
}

export function fetchHistory(sessionName: string, limit?: number): Promise<{ events: WhatsAppSessionEvent[] }> {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/history${query}`);
}

// --- Milestone 3, Bloco 6 (D22): DTOs e funcoes de `conversations`/`ai-interactions` ---
// Tipos espelham exatamente o que `apps/api` serializa (ver
// `services/conversations/domain/entities/*` e
// `services/ai/domain/entities/AiInteraction.ts`); datas chegam como string
// ISO 8601, mesmo racional dos DTOs de sessoes acima.

export type ConversationStatus = 'bot' | 'human';

export interface ConversationSummary {
  id: string;
  tenantId: string;
  sessionName: string;
  contactJid: string;
  status: ConversationStatus;
  /** Dono do atendimento (M5D). Ausente = ninguém assumiu. `status: 'human'` + sem dono = "aguardando humano" (feature N2). */
  assignedToUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationPage {
  conversations: ConversationSummary[];
  nextCursor?: string;
}

export type MessageDirection = 'inbound' | 'outbound';

export interface ConversationMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: MessageDirection;
  content: string;
  occurredAt: string;
}

export type AiInteractionStatus = 'success' | 'validation_rejected' | 'provider_error';

/** `costUsd` permanece string (nunca number) — restricao herdada do Bloco 3b: valor decimal exato, sem arredondamento de ponto flutuante. */
export interface AiInteractionSummary {
  id: string;
  tenantId: string;
  conversationId: string;
  messageId?: string;
  provider: string;
  model?: string;
  promptVersion: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: string;
  latencyMs: number;
  status: AiInteractionStatus;
  errorMessage?: string;
  createdAt: string;
}

export interface FetchConversationsOptions {
  status?: ConversationStatus;
  limit?: number;
  cursor?: string;
}

export function fetchConversations(options: FetchConversationsOptions = {}): Promise<ConversationPage> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);
  const query = params.toString();
  return request(`/api/conversations${query ? `?${query}` : ''}`);
}

export function fetchConversationMessages(conversationId: string, limit?: number): Promise<{ messages: ConversationMessage[] }> {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages${query}`);
}

export function escalateConversation(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/escalate`, { method: 'POST' });
}

/** Envia uma mensagem do OPERADOR (feature N2). A API responde 202 (enfileirado); a mensagem aparece na timeline via o tempo real. */
export function sendConversationMessage(conversationId: string, content: string): Promise<{ status: string }> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export function resumeConversation(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/resume`, { method: 'POST' });
}

export function fetchAiInteractions(conversationId?: string, limit?: number): Promise<{ interactions: AiInteractionSummary[] }> {
  const params = new URLSearchParams();
  if (conversationId) params.set('conversationId', conversationId);
  if (limit) params.set('limit', String(limit));
  const query = params.toString();
  return request(`/api/ai-interactions${query ? `?${query}` : ''}`);
}

// --- Milestone 4, Bloco M4D: DTOs e funcoes de `analytics` (read-only, D51) ---
// Tipos espelham os DTOs de `services/analytics/domain/AnalyticsMetrics.ts`
// (apps/api). `costUsd` permanece STRING decimal exata (D46) — conversao para
// numero so na fronteira do grafico (M4E).

export interface AiUsagePoint {
  date: string;
  interactions: number;
  successCount: number;
  validationRejectedCount: number;
  providerErrorCount: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: string;
  avgLatencyMs: number;
}

export interface MessageFlowPoint {
  date: string;
  inbound: number;
  outbound: number;
}

export interface NewConversationsPoint {
  date: string;
  count: number;
}

export interface ConversationStatusCounts {
  bot: number;
  human: number;
}

export interface SessionStabilityPoint {
  date: string;
  connected: number;
  disconnected: number;
  connecting: number;
}

export interface AnalyticsRangeQuery {
  from: string;
  to: string;
}

function analyticsQuery({ from, to }: AnalyticsRangeQuery): string {
  const params = new URLSearchParams({ from, to });
  return `?${params.toString()}`;
}

export function fetchAiUsageAnalytics(range: AnalyticsRangeQuery): Promise<{ points: AiUsagePoint[] }> {
  return request(`/api/analytics/ai-usage${analyticsQuery(range)}`);
}

export function fetchMessagesAnalytics(range: AnalyticsRangeQuery): Promise<{ points: MessageFlowPoint[] }> {
  return request(`/api/analytics/messages${analyticsQuery(range)}`);
}

export function fetchConversationsAnalytics(
  range: AnalyticsRangeQuery,
): Promise<{ newConversations: NewConversationsPoint[]; statusCounts: ConversationStatusCounts }> {
  return request(`/api/analytics/conversations${analyticsQuery(range)}`);
}

export function fetchSessionStabilityAnalytics(range: AnalyticsRangeQuery): Promise<{ points: SessionStabilityPoint[] }> {
  return request(`/api/analytics/session-stability${analyticsQuery(range)}`);
}
