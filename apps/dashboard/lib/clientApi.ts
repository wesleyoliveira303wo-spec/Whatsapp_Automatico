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

export type WhatsAppDisconnectReason =
  'logged_out' | 'restart_required' | 'connection_lost' | 'timed_out' | 'unknown';

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

  /**
   * Onda 3 do redesign (2026-08-23) — este é o `JSON.parse` que roda no
   * NAVEGADOR, direto na frente de quem usa o produto: se o BFF (`pages/api/*`)
   * responder algo que não é JSON — uma página de erro HTML do próprio
   * Next.js (ex.: um erro lançado ANTES de qualquer `res.json()`, como um
   * middleware quebrado), um timeout de proxy, um 502 do Nginx em produção —
   * o `SyntaxError` daqui não era capturado em lugar nenhum: virava uma
   * promise rejeitada sem tratamento, ou — pior — quebrava o componente que
   * chamou `await request(...)` de dentro de um handler de clique/efeito.
   * Convertido em `ClientApiError` (o mesmo tipo que TODO componente já
   * trata para status 4xx/5xx — nenhuma tela precisa aprender um caso novo)
   * com um corpo que descreve o problema em vez de deixar a exceção crua
   * subir.
   */
  let body: unknown;
  if (!text) {
    body = undefined;
  } else {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ClientApiError(response.status >= 400 ? response.status : 502, {
        error: 'invalid_response',
        message: 'O servidor respondeu algo que não é JSON válido.',
      });
    }
  }

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

/**
 * Login de PESSOA (Fase Auth/Registro, 2026-08-26): so e-mail + senha — SEM
 * tenantId, resolvido no backend a partir do e-mail (unico global).
 * `user.mustChangePassword: true` = a tela deve levar para /change-password
 * antes de qualquer outra coisa.
 */
export function loginWithPassword(
  email: string,
  password: string,
): Promise<{ tenantId: string; user: SessionUserInfo }> {
  return request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Registro self-service (Fase Auth/Registro, 2026-08-26): cria Tenant+Owner
 * e ja autentica. `companyName` vira o nome do Tenant.
 */
export function registerAccount(
  name: string,
  email: string,
  password: string,
  companyName: string,
): Promise<{ tenantId: string; user: SessionUserInfo }> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, companyName }),
  });
}

/** Troca da propria senha (M5F-2). O BFF reloga sozinho — depois do 204 a sessao continua valida. */
export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
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

export function fetchUsers(
  params: { limit?: number; cursor?: string } = {},
): Promise<ManagedUserPage> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  const suffix = query.toString();
  return request(`/api/users${suffix ? `?${suffix}` : ''}`);
}

export function createUser(
  email: string,
  role: ManagedUserRole,
  temporaryPassword: string,
): Promise<{ user: ManagedUser }> {
  return request('/api/users', {
    method: 'POST',
    body: JSON.stringify({ email, role, temporaryPassword }),
  });
}

export function changeUserRole(
  userId: string,
  role: ManagedUserRole,
): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export function suspendUser(userId: string): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/suspend`, { method: 'POST' });
}

export function reactivateUser(userId: string): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/reactivate`, { method: 'POST' });
}

export function resetUserPassword(
  userId: string,
  temporaryPassword: string,
): Promise<{ user: ManagedUser }> {
  return request(`/api/users/${encodeURIComponent(userId)}/reset-password`, {
    method: 'POST',
    body: JSON.stringify({ temporaryPassword }),
  });
}

// --- Painel de auditoria (Fase 1, Bloco F1.5 — o "livro da portaria") ---

/** DTO de um evento de auditoria como a API devolve (AuditLog serializado — `occurredAt` como string ISO). */
export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  occurredAt: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  nextCursor?: string;
}

export function fetchAuditLogs(
  params: { limit?: number; cursor?: string; actorUserId?: string; action?: string } = {},
): Promise<AuditLogPage> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor) query.set('cursor', params.cursor);
  if (params.actorUserId) query.set('actorUserId', params.actorUserId);
  if (params.action) query.set('action', params.action);
  const suffix = query.toString();
  return request(`/api/audit-logs${suffix ? `?${suffix}` : ''}`);
}

// --- Base de Conhecimento (Nível 1 — o "Cérebro da IA") ---
// Migrada de 1:1 por tenant para 1:1 por SESSÃO (M6H-3, 2026-07-25) — cada
// WhatsApp pode ter seu próprio contexto de negócio.

/**
 * DTO do perfil de negócio como a API serializa. `null` quando nunca configurado. Data como string ISO.
 * F1.8 (2026-08-01): inclui campos de horário de atendimento.
 */
export interface AiBusinessProfile {
  tenantId: string;
  sessionName: string;
  content: string;
  updatedAt: string;
  /** F1.8 — `true` quando o aviso de fora do horário está ativo. */
  offHoursEnabled: boolean;
  /** F1.8 — texto personalizado enviado ao cliente fora do horário. `null` usa a mensagem padrão. */
  offHoursMessage: string | null;
  /** F1.8 — início do horário de atendimento no formato "HH:MM". `null` = não configurado. */
  workingHoursStart: string | null;
  /** F1.8 — fim do horário de atendimento no formato "HH:MM". `null` = não configurado. */
  workingHoursEnd: string | null;
  /** F1.8 — dias de atendimento como bitmask (bit0=Dom, bit1=Seg…bit6=Sáb). Padrão 62 = Seg–Sex. */
  workingDays: number;
  /** F1.8 — timezone IANA (ex.: "America/Sao_Paulo"). */
  timezone: string;
  /**
   * Fase 1 (2026-08-07) — Botão POWER: `true` = a IA processa/responde
   * novas mensagens desta sessão; `false` = desligada (WhatsApp continua
   * conectado, mensagens continuam chegando, atendimento humano continua
   * normal — só a resposta AUTOMÁTICA para).
   */
  aiEnabled: boolean;
}

/** F1.8 — campos opcionais para salvar o perfil. Campos não informados preservam o valor já gravado. */
export interface SaveAiProfileData {
  content: string;
  offHoursEnabled?: boolean;
  offHoursMessage?: string | null;
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  workingDays?: number;
  timezone?: string;
}

/** Lê o perfil da sessão. `profile: null` = ainda não configurado (a UI mostra o textarea vazio). */
export function fetchAiProfile(
  sessionName: string,
): Promise<{ profile: AiBusinessProfile | null }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/ai-profile`);
}

/** Salva (upsert) o perfil da sessão, incluindo campos de horário de atendimento (F1.8). */
export function saveAiProfile(
  sessionName: string,
  data: SaveAiProfileData,
): Promise<{ profile: AiBusinessProfile }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/ai-profile`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * Fase 1 (2026-08-07) — Botão POWER: liga/desliga SÓ `aiEnabled`, sem exigir
 * o restante do perfil (content/horário) — usado pelo botão no cabeçalho de
 * Conversas, que não depende da tela "Cérebro da IA" estar carregada.
 */
export function setAiEnabled(
  sessionName: string,
  aiEnabled: boolean,
): Promise<{ profile: AiBusinessProfile }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/ai-profile`, {
    method: 'PATCH',
    body: JSON.stringify({ aiEnabled }),
  });
}

// --- Preferências do Cérebro da IA (v3, Fase 3, 2026-08-26) ---
// POR SESSÃO (mesmo padrão do Cérebro da IA/FAQ, ADR #82). Controles REAIS
// de postura/limite operacional — nunca toggles decorativos: cada campo
// muda o prompt (`autonomyLevel`/`maxDiscountPercent`/`topicsToAvoid`/
// `escalateAfterAttempts`) ou a mensagem enviada ao cliente quando a IA
// escala por falha (`customHandoffMessage`). RBAC: `ai_profile:read`/
// `ai_profile:update` (mesmo nível de todo o Cérebro da IA).

export type AiAutonomyLevel = 'conservative' | 'balanced' | 'autonomous';

export interface AiPreferences {
  tenantId: string;
  sessionName: string;
  updatedAt: string;
  autonomyLevel: AiAutonomyLevel;
  maxDiscountPercent: number | null;
  topicsToAvoid: string | null;
  escalateAfterAttempts: number | null;
  customHandoffMessage: string | null;
}

/** Dados a salvar — todos opcionais (upsert parcial). `null` explícito limpa o campo. */
export interface SaveAiPreferencesData {
  autonomyLevel?: AiAutonomyLevel;
  maxDiscountPercent?: number | null;
  topicsToAvoid?: string | null;
  escalateAfterAttempts?: number | null;
  customHandoffMessage?: string | null;
}

/** Lê as preferências da sessão. `preferences: null` = ainda não configuradas (a UI mostra os defaults). */
export function fetchAiPreferences(
  sessionName: string,
): Promise<{ preferences: AiPreferences | null }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/ai-preferences`);
}

/** Salva (upsert parcial) as preferências da sessão. */
export function saveAiPreferences(
  sessionName: string,
  data: SaveAiPreferencesData,
): Promise<{ preferences: AiPreferences }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/ai-preferences`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// --- Respostas rápidas (Fase 1, Bloco F1.9) ---
// POR SESSÃO (mesmo padrão do Cérebro da IA, ADR #82) — cada WhatsApp pode
// ter seu próprio conjunto de frases prontas que o atendente insere com um
// clique no `MessageComposer`. Sem categorização (YAGNI, roadmap F1.9).

export interface QuickReply {
  id: string;
  tenantId: string;
  sessionName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Lista as respostas rápidas da sessão, ordenadas por criação (mais antigas primeiro). */
export function fetchQuickReplies(sessionName: string): Promise<{ quickReplies: QuickReply[] }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/quick-replies`);
}

/** Cria uma nova resposta rápida na sessão. Exige `quick_reply:manage` (administrator/owner). */
export function createQuickReply(
  sessionName: string,
  content: string,
): Promise<{ quickReply: QuickReply }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/quick-replies`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

/** Atualiza o texto de uma resposta rápida existente. Exige `quick_reply:manage`. */
export function updateQuickReply(
  sessionName: string,
  id: string,
  content: string,
): Promise<{ quickReply: QuickReply }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/quick-replies/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ content }),
    },
  );
}

/** Remove uma resposta rápida. Exige `quick_reply:manage`. */
export function deleteQuickReply(sessionName: string, id: string): Promise<void> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/quick-replies/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
}

// --- FAQ estruturada do Cérebro da IA (v3, Fase 2, 2026-08-25) ---
// POR SESSÃO (mesmo padrão do Cérebro da IA/Respostas Rápidas, ADR #82).
// Substitui o antigo botão "Cadastrar pergunta não respondida" que só
// anexava texto cru ao blob de conteúdo — aqui pergunta/resposta são campos
// de verdade, com categoria opcional e um toggle `active` (desativar sem
// apagar). RBAC: `ai_profile:read`/`ai_profile:update` (mesmo nível de todo
// o Cérebro da IA — administrator/owner).

export interface AiFaqEntry {
  id: string;
  tenantId: string;
  sessionName: string;
  question: string;
  answer: string;
  category: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Lista TODAS as FAQs da sessão (ativas e inativas), ordenadas por criação. */
export function fetchAiFaqEntries(sessionName: string): Promise<{ faqEntries: AiFaqEntry[] }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/ai-faq`);
}

/** Cria uma nova FAQ na sessão. Exige `ai_profile:update` (administrator/owner). */
export function createAiFaqEntry(
  sessionName: string,
  question: string,
  answer: string,
  category: string | null,
): Promise<{ faqEntry: AiFaqEntry }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/ai-faq`, {
    method: 'POST',
    body: JSON.stringify({ question, answer, category }),
  });
}

/** Atualização parcial (pergunta/resposta/categoria/active) — usado tanto para editar quanto para o toggle. Exige `ai_profile:update`. */
export function updateAiFaqEntry(
  sessionName: string,
  id: string,
  input: Partial<Pick<AiFaqEntry, 'question' | 'answer' | 'category' | 'active'>>,
): Promise<{ faqEntry: AiFaqEntry }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/ai-faq/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(input),
    },
  );
}

/** Remove uma FAQ. Exige `ai_profile:update`. */
export function deleteAiFaqEntry(sessionName: string, id: string): Promise<void> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/ai-faq/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
}

// --- Tags livres (Redesign 2026-08-05, R4) ---
// Catálogo POR SESSÃO (mesmo padrão do Cérebro da IA/Respostas Rápidas,
// ADR #82). Paleta fixa de 8 cores (decisão do fundador — sem escolha livre
// de hex), mesma união usada pelo Domain (`apps/api`,
// `services/tags/domain/entities/Tag.ts`).

export const TAG_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'purple',
] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface Tag {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  color: TagColor;
  createdAt: string;
  updatedAt: string;
}

/** Lista as tags do catálogo da sessão, ordenadas por nome. */
export function fetchTags(sessionName: string): Promise<{ tags: Tag[] }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/tags`);
}

/** Cria uma nova tag no catálogo da sessão. Exige `tag:manage` (administrator/owner). */
export function createTag(
  sessionName: string,
  name: string,
  color: TagColor,
): Promise<{ tag: Tag }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/tags`, {
    method: 'POST',
    body: JSON.stringify({ name, color }),
  });
}

/** Atualiza nome e/ou cor de uma tag existente. Exige `tag:manage`. */
export function updateTag(
  sessionName: string,
  id: string,
  data: { name?: string; color?: TagColor },
): Promise<{ tag: Tag }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/tags/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(data),
    },
  );
}

/** Remove uma tag do catálogo (cascata remove as atribuições existentes). Exige `tag:manage`. */
export function deleteTag(sessionName: string, id: string): Promise<void> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/tags/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );
}

/** Atribui uma tag existente a uma conversa. Exige `message:send` (operator+, mesma régua de mover card no Pipeline). */
export function assignConversationTag(conversationId: string, tagId: string): Promise<void> {
  return request(
    `/api/conversations/${encodeURIComponent(conversationId)}/tags/${encodeURIComponent(tagId)}`,
    {
      method: 'POST',
    },
  );
}

/** Remove a atribuição de uma tag a uma conversa (idempotente). Exige `message:send`. */
export function unassignConversationTag(conversationId: string, tagId: string): Promise<void> {
  return request(
    `/api/conversations/${encodeURIComponent(conversationId)}/tags/${encodeURIComponent(tagId)}`,
    {
      method: 'DELETE',
    },
  );
}

// --- Contatos (Fase L, Blocos L1/L1b) ---
// Identidade durável de PESSOA, por TENANT (não por sessão): a mesma pessoa
// falando com dois WhatsApps da empresa é um contato só. Ver docstring de
// `WhatsAppContact` no `schema.prisma`.

export interface Contact {
  id: string;
  tenantId: string;
  phoneE164: string;
  name?: string;
  source: 'whatsapp' | 'import' | 'manual';
  /**
   * Fase L, Bloco L2 — quando este contato pediu para não receber mais
   * campanhas. `undefined` = nunca pediu. Efeito restrito a campanhas: NUNCA
   * desliga o atendimento normal (a pessoa continua conversando igual).
   */
  optOutAt?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Retrofit 2026-08-16 — resumo da atividade, para a coluna "Último
   * contato" e o botão "Abrir conversa". Ausentes num contato que ainda não
   * tem nenhuma conversa (ex.: importado de planilha e nunca escreveu).
   */
  lastConversationId?: string;
  lastConversationSessionName?: string;
  lastActivityAt?: string;
  /**
   * Padronização de exibição de contato (2026-08-20) — apelido do WhatsApp
   * capturado na conversa mais recente desta pessoa, quando houver. Só usado
   * como complemento (nunca substituto) do telefone num contato ainda sem
   * `name` salvo — ver `formatPersonLabel`.
   */
  lastConversationContactName?: string;
}

/** Contagens da base do tenant — cards do topo da tela de Contatos. */
export interface ContactStats {
  total: number;
  withConversation: number;
  withoutConversation: number;
  /** Aditivo (2026-08-17) — quantos contatos estão em opt-out agora. */
  optedOut: number;
  /** Aditivo (2026-08-18) — contagem por origem, para "Principais fontes". */
  bySource: { whatsapp: number; import: number; manual: number };
}

/** Contagens da base. Exige `contact:read`. */
export function fetchContactStats(): Promise<ContactStats> {
  return request('/api/contacts/stats');
}

export interface ContactPage {
  contacts: Contact[];
  nextCursor?: string;
}

/** Espelha `ContactStatusFilter` (`apps/api`) — as abas da tela de Contatos. */
export type ContactStatusFilter = 'with_conversation' | 'without_conversation' | 'opted_out';

/** Lista os contatos do tenant, paginado por cursor. Exige `contact:read` (operator+). */
export function fetchContacts(
  options: {
    limit?: number;
    cursor?: string;
    search?: string;
    status?: ContactStatusFilter;
  } = {},
): Promise<ContactPage> {
  const params = new URLSearchParams();
  if (options.limit !== undefined) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.search) params.set('search', options.search);
  if (options.status) params.set('status', options.status);
  const query = params.toString();
  return request(`/api/contacts${query ? `?${query}` : ''}`);
}

/** Motivo pelo qual uma linha da planilha foi rejeitada — espelha `InvalidImportRowReason` (`apps/api`). */
export type ContactImportRowReason = 'missing_phone' | 'invalid_phone' | 'duplicate_in_file';

export interface ContactImportInvalidRow {
  rowNumber: number;
  reason: ContactImportRowReason;
  rawPhone?: string;
}

export interface ContactImportReport {
  totalRows: number;
  created: number;
  enriched: number;
  unchanged: number;
  invalid: ContactImportInvalidRow[];
}

/**
 * Envia o TEXTO CRU de um arquivo `.csv` para importação de contatos. Exige
 * `contact:manage` (administrator/owner) — uma importação em lote afeta a
 * base do tenant inteiro de uma vez.
 *
 * Corpo NÃO é JSON (diferente de todo outro método deste arquivo) — por
 * isso não usa `request()`, que sempre serializa `body` como JSON e sempre
 * espera resposta JSON (esta rota também devolve JSON, então o parse de
 * resposta é reaproveitado; só o corpo ENVIADO foge do padrão).
 */
export async function importContacts(csvText: string): Promise<ContactImportReport> {
  const response = await fetch('/api/contacts/import', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ClientApiError(response.status, body);
  }
  return body as ContactImportReport;
}

/** Marca um contato como opt-out (não recebe mais campanhas). Exige `contact:manage`. */
export function optOutContact(contactId: string): Promise<{ contact: Contact }> {
  return request(`/api/contacts/${encodeURIComponent(contactId)}/opt-out`, { method: 'POST' });
}

/** Reverte um opt-out. Exige `contact:manage`. */
export function optInContact(contactId: string): Promise<{ contact: Contact }> {
  return request(`/api/contacts/${encodeURIComponent(contactId)}/opt-in`, { method: 'POST' });
}

// --- CRUD de Contatos (Reorganização Contatos/Campanhas, 2026-08-17) ---
// A tela de Contatos vira um CRM de verdade: criar/editar/remover um contato
// manualmente. Exige `contact:manage`.

/** Cria um contato manualmente. Se o telefone já existir, devolve o contato como está (`wasCreated: false`) — nunca sobrescreve um nome já definido. */
export function createContact(input: {
  phone: string;
  name?: string;
}): Promise<{ contact: Contact; wasCreated: boolean }> {
  return request('/api/contacts', { method: 'POST', body: JSON.stringify(input) });
}

/** Edita nome e/ou telefone de um contato existente. */
export function updateContact(
  contactId: string,
  input: { name?: string; phone?: string },
): Promise<{ contact: Contact }> {
  return request(`/api/contacts/${encodeURIComponent(contactId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

/** Remove um contato definitivamente (não apaga o histórico de conversa). */
export async function deleteContact(contactId: string): Promise<void> {
  await request(`/api/contacts/${encodeURIComponent(contactId)}`, { method: 'DELETE' });
}

// --- Campanhas (Fase L, Bloco L3) ---
// Só CRIA e CALCULA quem receberia — NUNCA envia nenhuma mensagem. O envio
// real (fila + ritmo + disjuntor de segurança) é trabalho de um bloco
// futuro (L4/L5), ainda não implementado.

export type CampaignStatus =
  'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled';

/** Categorias de mídia suportadas para o anexo de campanha (Fase L, Bloco L8) — mesmo vocabulário do envio de mídia numa conversa, exceto `text`/`sticker`. */
export type CampaignMediaContentType = 'image' | 'audio' | 'video' | 'document';

export interface Campaign {
  id: string;
  tenantId: string;
  sessionName: string;
  name: string;
  /** Texto livre opcional (Reorganização Contatos/Campanhas, 2026-08-17) — só para o operador se orientar. */
  description?: string;
  messageTemplate: string;
  status: CampaignStatus;
  /** Fase L, Bloco L4 — só relevante quando `status === 'paused'` (motivo da pausa automática, ex.: teto diário/disjuntor de segurança). */
  pausedReason?: string;
  /** Fase L, Bloco L8 — metadados do anexo (sem o binário; ver `campaignMediaUrl` para exibir/baixar). `undefined` = campanha só de texto. */
  media?: {
    contentType: CampaignMediaContentType;
    mimeType: string;
    fileName?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export type CampaignSkipReason = 'opt_out' | 'active_human_conversation' | 'recently_contacted';

/** O "63 de 100, eis os motivos" — resumo devolvido junto com a campanha recém-criada. */
export interface CampaignRecipientSummary {
  total: number;
  pending: number;
  skipped: number;
  skipReasons: Partial<Record<CampaignSkipReason, number>>;
}

/** Um destinatário bruto vindo de planilha ou digitado manualmente — origens B/C (Reorganização 2026-08-17). */
export interface RawPhoneRecipient {
  rawPhone: string;
  name?: string;
}

/**
 * Cria a campanha e materializa os destinatários (aplica as três regras de
 * supressão: opt-out, conversa ativa com humano, contatado há menos de 7
 * dias por outra campanha). Combina três origens: `contactIds` (Contatos
 * salvos), `phoneRecipients` (planilha + números colados, já combinados pela
 * UI). Exige `campaign:manage` (administrator+).
 */
export function createCampaign(input: {
  sessionName: string;
  name: string;
  description?: string;
  messageTemplate: string;
  contactIds: string[];
  phoneRecipients: RawPhoneRecipient[];
}): Promise<{ campaign: Campaign; summary: CampaignRecipientSummary }> {
  return request('/api/campaigns', { method: 'POST', body: JSON.stringify(input) });
}

/** Motivo pelo qual uma linha da planilha de destinatários foi rejeitada — espelha `InvalidImportRowReason` (`apps/api`). */
export type RecipientsCsvInvalidRowReason = 'missing_phone' | 'invalid_phone' | 'duplicate_in_file';

export interface RecipientsCsvInvalidRow {
  rowNumber: number;
  reason: RecipientsCsvInvalidRowReason;
  rawPhone?: string;
}

export interface ParseRecipientsCsvResult {
  totalRows: number;
  recipients: RawPhoneRecipient[];
  invalid: RecipientsCsvInvalidRow[];
}

/**
 * Envia o TEXTO CRU de uma planilha `.csv` de destinatários de campanha —
 * SÓ PARSEIA, nunca persiste nada (nem campanha, nem Contato). Exige
 * `campaign:manage`. Mesmo padrão de `importContacts` (corpo não é JSON).
 */
export async function parseRecipientsCsv(csvText: string): Promise<ParseRecipientsCsvResult> {
  const response = await fetch('/api/campaigns/parse-recipients-csv', {
    method: 'POST',
    headers: { 'Content-Type': 'text/csv' },
    body: csvText,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ClientApiError(response.status, body);
  }
  return body as ParseRecipientsCsvResult;
}

export interface CampaignPage {
  campaigns: Campaign[];
  nextCursor?: string;
}

/** Lista campanhas do tenant, paginado por cursor. Exige `campaign:read` (operator+). */
export function fetchCampaigns(
  options: { limit?: number; cursor?: string; sessionName?: string } = {},
): Promise<CampaignPage> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.sessionName) params.set('sessionName', options.sessionName);
  const query = params.toString();
  return request(`/api/campaigns${query ? `?${query}` : ''}`);
}

/** Visão geral de campanhas de uma sessão (retrofit visual 2026-08-18) — cards do topo + donut "Status das campanhas". */
export interface CampaignSessionOverview {
  totalCampaigns: number;
  statusCounts: Record<CampaignStatus, number>;
  totalSent: number;
  totalReplied: number;
  responseRate?: number;
  trends: {
    campaignsDeltaPct?: number;
    messagesSentDeltaPct?: number;
    repliesDeltaPct?: number;
    responseRateDeltaPct?: number;
  };
}

/** Exige `campaign:read`. */
export function fetchCampaignsOverview(sessionName: string): Promise<{
  overview: CampaignSessionOverview;
}> {
  return request(`/api/campaigns/overview?sessionName=${encodeURIComponent(sessionName)}`);
}

/** Detalhe de uma campanha (campanha + resumo de destinatários). Exige `campaign:read`. */
export function fetchCampaign(
  campaignId: string,
): Promise<{ campaign: Campaign; summary: CampaignRecipientSummary }> {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}`);
}

// --- Fase L, Bloco L4 — motor de envio (start/pause/cancel + destinatários) ---

export type CampaignRecipientStatus = 'pending' | 'sent' | 'failed' | 'skipped' | 'replied';

export interface CampaignRecipient {
  id: string;
  tenantId: string;
  campaignId: string;
  /** Ausente para um destinatário "solto" (sem Contato) — ver `phoneE164`/`name`. */
  contactId?: string;
  /** Só presente quando `contactId` é ausente — o telefone de quem não tem Contato salvo. */
  phoneE164?: string;
  /** Nome trazido pela planilha/lista manual — só existe junto de `phoneE164`. */
  name?: string;
  /**
   * Padronização de exibição de contato (2026-08-20) — quando `contactId` é
   * definido, o Contato salvo (nome, se houver, e telefone) + o apelido do
   * WhatsApp da conversa vinculada, resolvidos em lote pela API. `undefined`
   * para um destinatário "solto" (ver `phoneE164`/`name` acima).
   */
  contact?: {
    name?: string;
    phoneE164: string;
    nickname?: string;
  };
  status: CampaignRecipientStatus;
  skipReason?: string;
  errorMessage?: string;
  sentAt?: string;
  repliedAt?: string;
  conversationId?: string;
  createdAt: string;
}

export interface CampaignRecipientPage {
  recipients: CampaignRecipient[];
  nextCursor?: string;
}

/** Destinatários calculados de uma campanha, paginado, com filtro opcional por status. Exige `campaign:read`. */
export function fetchCampaignRecipients(
  campaignId: string,
  options: { limit?: number; cursor?: string; status?: CampaignRecipientStatus } = {},
): Promise<CampaignRecipientPage> {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.status) params.set('status', options.status);
  const query = params.toString();
  return request(
    `/api/campaigns/${encodeURIComponent(campaignId)}/recipients${query ? `?${query}` : ''}`,
  );
}

/** Inicia (ou retoma, após pausa) o envio real da campanha. Exige `campaign:manage`. */
export function startCampaign(campaignId: string): Promise<{ campaign: Campaign }> {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/start`, { method: 'POST' });
}

/** Pausa uma campanha em execução — não toca os jobs já agendados, só impede novos envios. Exige `campaign:manage`. */
export function pauseCampaign(campaignId: string): Promise<{ campaign: Campaign }> {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/pause`, { method: 'POST' });
}

/** Cancela uma campanha (terminal — não pode ser retomada). Exige `campaign:manage`. */
export function cancelCampaign(campaignId: string): Promise<{ campaign: Campaign }> {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/cancel`, { method: 'POST' });
}

/**
 * Reabre uma campanha `completed`/`cancelled` (retrofit 2026-08-18 — "não
 * existe nenhum botão onde podemos reiniciar ou refazer uma campanha").
 * Devolve destinatários que FALHARAM (ex.: instabilidade momentânea da
 * conexão do WhatsApp) para pendente e reagenda o envio — nunca reenvia a
 * quem foi suprimido por opt-out/conversa ativa/contatado recentemente.
 * Exige `campaign:manage`.
 */
export function reopenCampaign(campaignId: string): Promise<{ campaign: Campaign }> {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/reopen`, { method: 'POST' });
}

/**
 * Remove a campanha definitivamente (retrofit visual 2026-08-18, menu "⋮"
 * da lista). Exige `campaign:manage`. A API recusa (400) campanhas
 * `running` — pause ou cancele antes.
 */
export async function deleteCampaign(campaignId: string): Promise<void> {
  await request(`/api/campaigns/${encodeURIComponent(campaignId)}`, { method: 'DELETE' });
}

// --- Fase L, Bloco L7 — métricas de campanha ---

/** Espelha `CampaignLinkedConversationStage` (`apps/api`). */
export type CampaignLinkedConversationStage =
  'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost';

/**
 * O funil real de uma campanha (`FASE_L_MOTOR_DE_LEADS.md` §13) — além de
 * "mensagens enviadas". Campos opcionais representam "ainda sem denominador
 * válido" (ex.: nenhuma resposta ainda), nunca um `0` disfarçado.
 */
export interface CampaignMetrics {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  replied: number;
  skipped: number;
  skipReasons: Partial<Record<CampaignSkipReason, number>>;
  responseRate?: number;
  avgTimeToFirstReplyMinutes?: number;
  stageCounts: Record<CampaignLinkedConversationStage, number>;
  escalatedCount: number;
  conversionRate?: number;
  aiCostUsd: number;
  costPerConversionUsd?: number;
  unknownAnswerCount: number;
}

/** Métricas de uma campanha. Exige `campaign:read`. */
export function fetchCampaignMetrics(campaignId: string): Promise<{ metrics: CampaignMetrics }> {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/metrics`);
}

// --- Mídia de campanha (Fase L, Bloco L8) ---

/**
 * Anexa (ou substitui) a mídia de uma campanha `draft`. Mesmo padrão de
 * `sendConversationMedia`: corpo é o ARQUIVO BRUTO (não JSON), categoria/nome
 * viajam em headers `x-media-*`. Sem legenda separada — a legenda É o
 * `messageTemplate` já cadastrado. Exige `campaign:manage`.
 */
export async function attachCampaignMedia(
  campaignId: string,
  file: File,
  contentType: CampaignMediaContentType,
): Promise<{ campaign: Campaign }> {
  const headers: Record<string, string> = {
    'content-type': file.type || 'application/octet-stream',
    'x-media-content-type': contentType,
    'x-media-filename': file.name,
  };
  const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/media`, {
    method: 'POST',
    headers,
    body: file,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ClientApiError(response.status, body);
  }
  return body as { campaign: Campaign };
}

/** Remove a mídia anexada a uma campanha `draft`. Exige `campaign:manage`. */
export function removeCampaignMedia(campaignId: string): Promise<{ campaign: Campaign }> {
  return request(`/api/campaigns/${encodeURIComponent(campaignId)}/media`, { method: 'DELETE' });
}

/**
 * URL de preview/download do anexo — usada direto como `src` de `<img>` (ou
 * `href` de link, para documento/vídeo/áudio). O proxy do BFF (`GET
 * /api/campaigns/:id/media`) já repassa o `Content-Type` real do arquivo.
 */
export function campaignMediaUrl(campaignId: string): string {
  return `/api/campaigns/${encodeURIComponent(campaignId)}/media`;
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

export function fetchHistory(
  sessionName: string,
  limit?: number,
): Promise<{ events: WhatsAppSessionEvent[] }> {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/history${query}`);
}

/**
 * Milestone 6, Bloco M6H-2b — foto de perfil de um contato desta sessão,
 * buscada ao vivo (nunca cacheada em disco/banco — ver `WhatsAppProvider.
 * getProfilePictureUrl` em `apps/api`). `avatarUrl: undefined` é uma
 * resposta válida ("sem foto"), não um erro — quem chama decide o fallback
 * visual (ver `ContactAvatar.tsx`).
 */
export function fetchContactAvatar(
  sessionName: string,
  contactJid: string,
): Promise<{ avatarUrl?: string }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/contacts/${encodeURIComponent(contactJid)}/avatar`,
  );
}

// --- Milestone 3, Bloco 6 (D22): DTOs e funcoes de `conversations`/`ai-interactions` ---
// Tipos espelham exatamente o que `apps/api` serializa (ver
// `services/conversations/domain/entities/*` e
// `services/ai/domain/entities/AiInteraction.ts`); datas chegam como string
// ISO 8601, mesmo racional dos DTOs de sessoes acima.

export type ConversationStatus = 'bot' | 'human';

/** Pipeline de CRM (Milestone 6, Bloco M6H-5) — mesmo vocabulário de `Conversation['stage']` (`apps/api`). */
export type ConversationStage = 'new' | 'contacted' | 'negotiating' | 'closed_won' | 'closed_lost';

/** Quem gravou `stage` pela última vez — controla se a IA ainda pode reclassificar (`apps/api`, `shouldAiUpdateStage`). */
export type ConversationStageSetBy = 'ai' | 'human';

export interface ConversationSummary {
  id: string;
  tenantId: string;
  sessionName: string;
  contactJid: string;
  /** Nome de exibição do WhatsApp (`pushName`, Milestone 6, Bloco M6H-2b). Ausente = usa `formatContactJid(contactJid)` como fallback. */
  contactName?: string;
  /**
   * Identidade durável da pessoa (Fase L, Bloco L1) — `id` de um `Contact`
   * salvo na aba Contatos. `undefined` até o vínculo acontecer (automático,
   * quando o `contactJid` tem telefone real; ou manual, via o botão "Salvar
   * contato" do painel de contexto, retrofit visual 2026-08-18). Ausente
   * permanentemente para conversas `@lid` (endereço de privacidade sem
   * telefone algum a derivar).
   */
  contactId?: string;
  /**
   * Padronização de exibição de contato (2026-08-20) — nome que um humano
   * salvou para esta pessoa na aba Contatos (`WhatsAppContact.name`),
   * resolvido a partir de `contactId`. `undefined` sem `contactId`, ou com um
   * Contato ainda sem nome salvo (a maioria — criados automaticamente pelo
   * WhatsApp). É este campo, e só ele, que autoriza `formatContactDisplayName`
   * a mostrar UM nome sozinho — sem ele, a UI sempre mostra telefone + apelido
   * do WhatsApp (`contactName`, quando houver).
   */
  savedContactName?: string;
  status: ConversationStatus;
  /** Dono do atendimento (M5D). Ausente = ninguém assumiu. */
  assignedToUserId?: string;
  /**
   * Reforma do escalonamento (2026-07-25) — presente (ISO 8601) quando a IA
   * pediu atenção humana e ninguém assumiu ainda; `status` continua `'bot'`
   * nesse caso (a IA segue respondendo). É ISSO que hoje significa
   * "aguardando atendente" — não mais `status: 'human'` sem dono (ver
   * `Conversation.escalatedAt`, `apps/api`).
   */
  escalatedAt?: string;
  /**
   * Indicador de não lidas (2026-07-25) — quantas mensagens do CONTATO
   * chegaram desde a última vez que um operador abriu esta conversa pela
   * Dashboard. `0` = tudo lido. Zerado via `markConversationAsRead()`.
   */
  unreadCount: number;
  /** Pipeline de CRM (Milestone 6, Bloco M6H-5) — estágio no funil de vendas. Toda conversa nasce em `'new'`. */
  stage: ConversationStage;
  /** Quem gravou `stage` pela última vez — `'ai'` até uma correção manual, depois disso a IA nunca mais sobrescreve. */
  stageSetBy: ConversationStageSetBy;
  /** Quando `stage` foi gravado pela última vez (ISO 8601). */
  stageUpdatedAt: string;
  /**
   * ADR #94 (2026-08-01) — `true` quando a conversa foi marcada como fora
   * do funil comercial (amigo/família/fornecedor/funcionário no mesmo
   * número da empresa): a IA para de responder automaticamente, some do
   * Pipeline e do funil de Analytics, mas o histórico continua acessível.
   * `false` por padrão.
   */
  excludedFromPipeline: boolean;
  /** Fase 1, Bloco F1.7 (2026-08-01) — trecho da última mensagem (qualquer direção), para a linha da lista de Conversas. Ausente só numa conversa sem nenhuma mensagem ainda. */
  lastMessagePreview?: string;
  /** Acompanha `lastMessagePreview` (ISO 8601). */
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  /**
   * Redesign 2026-08-05 (R4) — tags livres atribuídas a esta conversa.
   * Projeção mínima (id/name/color), populada pela API via `include` direto
   * no Postgres — ver `Conversation.tags`, `apps/api`. Sempre um array
   * (nunca `undefined`); conversa sem tag nenhuma é `[]`.
   */
  tags: ConversationTagSummary[];
  /**
   * Redesign 2026-08-05 (R5) — resumo da conversa gerado pela IA sob
   * demanda (nunca automático). `undefined` até a primeira geração.
   */
  aiSummary?: string;
  /** Acompanha `aiSummary` (ISO 8601) — quando foi gerado pela última vez. */
  aiSummaryUpdatedAt?: string;
  /**
   * Quantas mensagens a conversa tinha no momento da última geração —
   * comparado com a contagem atual (`useMessagesTimeline`) para acender o
   * aviso de "desatualizado" na UI. `0` até a primeira geração.
   */
  aiSummaryMessageCount: number;
}

/** Projeção de `Tag` exibida numa `ConversationSummary` — ver docstring do campo `tags` acima. */
export interface ConversationTagSummary {
  id: string;
  name: string;
  color: TagColor;
}

export interface ConversationPage {
  conversations: ConversationSummary[];
  nextCursor?: string;
}

export type MessageDirection = 'inbound' | 'outbound';

/** Fase 1, Bloco F1.1 (ADR #90) — mesmo vocabulário de `MessageContentType` na API. */
export type MessageContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker';

/**
 * Referência a um arquivo de mídia (Fase 1, Bloco F1.1, ADR #90) — nunca o
 * binário em si. `mediaKeyEncrypted` chega até aqui só porque a API
 * serializa a entidade `Message` inteira sem DTO (mesmo padrão que já fez
 * `contactName` "aparecer de graça"); o Dashboard nunca a usa diretamente —
 * só monta a URL do proxy BFF (`getMessageMediaUrl`), que resolve tudo no
 * servidor. Nunca logar/exibir este campo.
 */
export interface ConversationMessageMedia {
  mimeType: string;
  url: string;
  mediaKeyEncrypted: string;
  fileName?: string;
}

export interface ConversationMessage {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: MessageDirection;
  content: string;
  /** Fase 1, Bloco F1.1 (ADR #90). Ausente em dados antigos (nunca deveria acontecer, mas trata como `'text'` por segurança — ver uso em `MessageBubble`). */
  contentType?: MessageContentType;
  /** Presente só quando `contentType` não é `'text'`. */
  media?: ConversationMessageMedia;
  occurredAt: string;
}

export type AiInteractionStatus = 'success' | 'validation_rejected' | 'provider_error';

/** Fase 1, Bloco F1.4 (2026-08-01) — distingue por que a IA escalou: não sabia responder vs. o cliente pediu um atendente. Ausente = a IA não escalou nessa interação. */
export type AiEscalationReason = 'unknown_answer' | 'requested_human';

/** `costUsd` permanece string (nunca number) — restricao herdada do Bloco 3b: valor decimal exato, sem arredondamento de ponto flutuante. */
export interface AiInteractionSummary {
  id: string;
  tenantId: string;
  conversationId: string;
  /**
   * CAMPO DE DUPLO PROPÓSITO no backend (achado 2026-08-18, corrigindo a nota
   * antiga deste comentário — o comentário anterior dizia que `linkMessage()`
   * não sobrescrevia mais este campo; isso está errado, `OutboundCommandConsumer`
   * ainda chama `linkMessage()` normalmente). Ao ser gravado (`record()`),
   * aponta para a `Message` INBOUND que originou a geração (Fase 1, F1.4);
   * DEPOIS de um envio outbound bem-sucedido, `linkMessage()` (Bloco 3b/4)
   * REESCREVE este mesmo campo para apontar à `Message` OUTBOUND enviada.
   * Nunca confiar neste valor para inferir "isto é uma pergunta do cliente"
   * sem saber qual dos dois estados vale no momento — ver o guard em
   * `MessageTimeline.tsx` (nunca aplica o selo "Gerada por IA" a uma
   * mensagem inbound, mesmo que o id bata).
   */
  messageId?: string;
  provider: string;
  model?: string;
  promptVersion: string;
  tokensInput: number;
  tokensOutput: number;
  costUsd: string;
  latencyMs: number;
  status: AiInteractionStatus;
  /** Fase 1, Bloco F1.4 — só presente quando status="success" e a IA emitiu um marcador de escalonamento. */
  escalationReason?: AiEscalationReason;
  errorMessage?: string;
  createdAt: string;
}

export interface FetchConversationsOptions {
  status?: ConversationStatus;
  limit?: number;
  cursor?: string;
  /** Milestone 6, Bloco M6H-2 — filtra pela sessão de WhatsApp (`WhatsAppConversation.sessionName`). Ausente = todas as sessões do tenant (comportamento antigo). */
  sessionName?: string;
  /** Reforma do escalonamento (2026-07-25) — filtra só conversas com `escalatedAt` definido ("aguardando atendente"). */
  needsHumanAttention?: boolean;
  /** ADR #94 (2026-08-01) — `true`/`false` filtra dentro/fora do funil comercial; ausente = sem filtro. */
  excludedFromPipeline?: boolean;
}

export function fetchConversations(
  options: FetchConversationsOptions = {},
): Promise<ConversationPage> {
  const params = new URLSearchParams();
  if (options.status) params.set('status', options.status);
  if (options.limit) params.set('limit', String(options.limit));
  if (options.cursor) params.set('cursor', options.cursor);
  if (options.sessionName) params.set('sessionName', options.sessionName);
  if (options.needsHumanAttention) params.set('needsHumanAttention', 'true');
  if (options.excludedFromPipeline !== undefined)
    params.set('excludedFromPipeline', String(options.excludedFromPipeline));
  const query = params.toString();
  return request(`/api/conversations${query ? `?${query}` : ''}`);
}

/**
 * Fase 1, Bloco F1.10 (estabilidade para beta) — busca UMA conversa direto
 * pelo id (`GET /api/conversations/:id`), sem varrer a listagem paginada.
 * Lança `ClientApiError` (404) se a conversa não existir/não for do tenant —
 * `useConversationDetail` trata isso como "conversa não encontrada", mesmo
 * comportamento que já existia para o resultado de uma varredura sem match.
 */
export function fetchConversation(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}`);
}

export function fetchConversationMessages(
  conversationId: string,
  limit?: number,
): Promise<{ messages: ConversationMessage[] }> {
  const query = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages${query}`);
}

/**
 * URL do proxy BFF de mídia (Fase 1, Bloco F1.1, ADR #90) — deliberadamente
 * NÃO uma função `fetch`/`request()` como as demais deste arquivo: o
 * consumidor (`MessageBubble`) usa isto direto em `src=`/`href=` de
 * `<img>`/`<audio>`/`<video>`/`<a>`, deixando o navegador baixar o binário
 * nativamente (streaming de verdade, nunca JSON/base64) — mesmo racional já
 * usado para a foto de perfil (`ContactAvatar`), só que ali a API devolve
 * uma URL pública do WhatsApp; aqui o próprio BFF É o servidor do binário.
 */
export function getMessageMediaUrl(conversationId: string, messageId: string): string {
  return `/api/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/media`;
}

export function escalateConversation(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/escalate`, {
    method: 'POST',
  });
}

/** Envia uma mensagem do OPERADOR (feature N2). A API responde 202 (enfileirado); a mensagem aparece na timeline via o tempo real. */
export function sendConversationMessage(
  conversationId: string,
  content: string,
): Promise<{ status: string }> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

/**
 * Envia uma mensagem de MÍDIA do OPERADOR (Fase 1, Bloco F1.3). Deliberadamente
 * NÃO usa a função `request()` genérica deste arquivo (que sempre serializa
 * `body` como JSON) — o corpo é o arquivo BRUTO (`File`/`Blob`), e a
 * categoria/legenda/nome viajam em headers `x-media-*` (mesmo contrato da
 * rota BFF/API, ver `sendMediaHeadersSchema` no router). Síncrono/200 (não
 * 202): diferente de `sendConversationMessage`, o operador sabe na hora se o
 * envio deu certo.
 */
export async function sendConversationMedia(
  conversationId: string,
  file: File,
  options: { contentType: 'image' | 'audio' | 'video' | 'document'; caption?: string },
): Promise<ConversationMessage> {
  const headers: Record<string, string> = {
    'content-type': file.type || 'application/octet-stream',
    'x-media-content-type': options.contentType,
    'x-media-filename': file.name,
  };
  if (options.caption?.trim()) {
    headers['x-media-caption'] = options.caption.trim();
  }

  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/media`, {
    method: 'POST',
    headers,
    body: file,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ClientApiError(response.status, body);
  }
  return body as ConversationMessage;
}

export function resumeConversation(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/resume`, {
    method: 'POST',
  });
}

/** Indicador de não lidas (2026-07-25) — zera `unreadCount` ao abrir a conversa. */
export function markConversationAsRead(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/read`, {
    method: 'POST',
  });
}

/**
 * Pipeline de CRM (Milestone 6, Bloco M6H-5) — move a conversa para um novo
 * estágio (board Kanban, arrastar card entre colunas). Grava
 * `stageSetBy: 'human'` do lado da API, mas isso é só o registro de quem
 * classificou por último: desde a ADR #89, a IA continua reclassificando
 * esta conversa nas próximas respostas — o que ela nunca faz é mover o card
 * para TRÁS no funil, então um avanço manual nunca é desfeito.
 */
export function updateConversationStage(
  conversationId: string,
  stage: ConversationStage,
): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/stage`, {
    method: 'POST',
    body: JSON.stringify({ stage }),
  });
}

/**
 * Gera (ou atualiza) o resumo da conversa pela IA — Redesign 2026-08-05
 * (R5). Sempre sob demanda (botão), nunca automático; devolve a
 * `ConversationSummary` com `aiSummary`/`aiSummaryUpdatedAt`/
 * `aiSummaryMessageCount` já atualizados. Pode levar alguns segundos
 * (chamada síncrona à IA) — quem chama deve mostrar um estado de
 * carregamento.
 */
export function generateConversationSummary(conversationId: string): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/summary`, {
    method: 'POST',
  });
}

/**
 * ADR #94 (2026-08-01) — marca/desmarca uma conversa como fora do funil
 * comercial. Mesmo padrão de `updateConversationStage` (POST idempotente,
 * devolve a `ConversationSummary` atualizada).
 */
export function setConversationExcludedFromPipeline(
  conversationId: string,
  excluded: boolean,
): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/exclude-from-pipeline`, {
    method: 'POST',
    body: JSON.stringify({ excluded }),
  });
}

/**
 * Botão "Salvar contato" do painel de contexto (retrofit visual 2026-08-18):
 * salva (ou renomeia) o `Contact` desta conversa na aba Contatos, sem sair da
 * tela. `name` é opcional — omitido, o contato é salvo/vinculado sem nome.
 * A API responde 422 quando não há telefone real a derivar (conversa `@lid`).
 */
export function saveConversationContact(
  conversationId: string,
  name?: string,
): Promise<ConversationSummary> {
  return request(`/api/conversations/${encodeURIComponent(conversationId)}/save-contact`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function fetchAiInteractions(
  conversationId?: string,
  limit?: number,
): Promise<{ interactions: AiInteractionSummary[] }> {
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
// Migrado de tenant-wide para POR SESSAO — Milestone 6, Bloco M6H-4
// (2026-07-26): toda funcao de fetch abaixo passou a exigir `sessionName`.

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

/** Fase 1, Bloco F1.6 (Analytics de negócio) — contagem atual de conversas por estágio do Pipeline. Chaves lowercase (mesma convenção de `ConversationStage` em `services/conversations`). */
export interface PipelineFunnelCounts {
  new: number;
  contacted: number;
  negotiating: number;
  closed_won: number;
  closed_lost: number;
}

/** Fase 1, Bloco F1.6 — taxa de escalonamento por dia. */
export interface EscalationRatePoint {
  date: string;
  totalConversations: number;
  escalatedConversations: number;
}

export interface AnalyticsRangeQuery {
  from: string;
  to: string;
}

function analyticsQuery({ from, to }: AnalyticsRangeQuery): string {
  const params = new URLSearchParams({ from, to });
  return `?${params.toString()}`;
}

export function fetchAiUsageAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): Promise<{ points: AiUsagePoint[] }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/analytics/ai-usage${analyticsQuery(range)}`,
  );
}

export function fetchMessagesAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): Promise<{ points: MessageFlowPoint[] }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/analytics/messages${analyticsQuery(range)}`,
  );
}

export function fetchConversationsAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): Promise<{ newConversations: NewConversationsPoint[]; statusCounts: ConversationStatusCounts }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/analytics/conversations${analyticsQuery(range)}`,
  );
}

export function fetchSessionStabilityAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): Promise<{ points: SessionStabilityPoint[] }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/analytics/session-stability${analyticsQuery(range)}`,
  );
}

/** Fase 1, Bloco F1.6 — retrato atual (sem faixa de tempo), mesmo racional de `fetchConversationsAnalytics.statusCounts`. */
export function fetchPipelineFunnelAnalytics(
  sessionName: string,
): Promise<{ funnel: PipelineFunnelCounts }> {
  return request(`/api/sessions/${encodeURIComponent(sessionName)}/analytics/pipeline`);
}

export function fetchEscalationRateAnalytics(
  sessionName: string,
  range: AnalyticsRangeQuery,
): Promise<{ points: EscalationRatePoint[] }> {
  return request(
    `/api/sessions/${encodeURIComponent(sessionName)}/analytics/escalation-rate${analyticsQuery(range)}`,
  );
}
