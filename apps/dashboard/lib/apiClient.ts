import type { DashboardSession } from './dashboardSession';

/**
 * Base URL do backend (`apps/api`), lida SOMENTE no servidor (nunca
 * `NEXT_PUBLIC_*` — essa era a variavel antiga, usada quando o browser
 * chamava a API diretamente; ver decisao de arquitetura da Milestone 2, que
 * introduziu o Dashboard como BFF exatamente para eliminar essa chamada
 * direta). Deliberadamente SEM o prefixo `NEXT_PUBLIC_`: isso garante que o
 * Next.js nunca a inclui no bundle enviado ao browser — reforca, no nivel
 * de nomenclatura, que so o servidor (rotas `pages/api/*`) deve conhecer
 * onde a API vive.
 */
export function getApiBaseUrl(): string {
  const url = process.env.API_BASE_URL;
  if (!url) {
    throw new Error('API_BASE_URL nao configurada — defina no .env (ver .env.example).');
  }
  return url;
}

/** Resposta normalizada — sempre devolve o status e o corpo ja decodificado, nunca lanca para respostas HTTP de erro (4xx/5xx sao um resultado valido, nao uma excecao). */
export interface ApiResponse<T = unknown> {
  status: number;
  body: T;
}

/** Assinatura do cliente devolvido por `createApiClient()` — identica a de `callApi()`, so sem o recurso fixo. */
export type ApiClient = <T = unknown>(
  session: DashboardSession,
  path: string,
  init?: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> },
) => Promise<ApiResponse<T>>;

/**
 * Factory de cliente HTTP fino para `apps/api` (Milestone 3, Bloco 6 — D21
 * do levantamento arquitetural): fecha sobre um RECURSO
 * (`whatsapp-sessions`, `conversations`, `ai-interactions`) e devolve uma
 * funcao com a mesma assinatura de `callApi()`. Extraida como factory (nao
 * um parametro novo em `callApi`) para que os call sites existentes de
 * `callApi` (M2, Fase 3) continuem compilando sem NENHUMA alteracao —
 * mudanca estritamente aditiva, mesmo padrao dos composition roots do
 * backend (funcoes que constroem e fecham sobre dependencias).
 *
 * Injeta o header `X-API-Key` a partir da sessao do Dashboard (nunca lido
 * de outro lugar) — unico ponto do codigo do Dashboard que sabe o NOME
 * exato do header que a API espera (`requireApiKey.ts`).
 *
 * Path: sempre relativo a `/api/tenants/:tenantId/<resource>` — o
 * `tenantId` vem da propria sessao (`session.tenantId`), nunca de um
 * parametro solto que um chamador pudesse errar/omitir (fecha, por
 * construcao, a mesma classe de bug de IDOR que `requireApiKey`/
 * `resolveTenantFromApiKey` fecham do lado da API).
 */
export function createApiClient(resource: string): ApiClient {
  return async function call<T = unknown>(
    session: DashboardSession,
    path: string,
    init: {
      method?: string;
      body?: unknown;
      query?: Record<string, string | number | undefined>;
    } = {},
  ): Promise<ApiResponse<T>> {
    const baseUrl = getApiBaseUrl();
    const url = new URL(
      `/api/tenants/${encodeURIComponent(session.tenantId)}/${resource}${path}`,
      baseUrl,
    );

    if (init.query) {
      for (const [key, value] of Object.entries(init.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    // M5F-1: o header de credencial acompanha o PLANO da sessao — cracha de
    // pessoa (`Authorization: Bearer`) quando ha accessToken; chave da empresa
    // (`X-API-Key`) no formato original. O `authenticate` da API aceita ambos.
    const credentialHeader: Record<string, string> = session.accessToken
      ? { Authorization: `Bearer ${session.accessToken}` }
      : session.apiKey
        ? { 'X-API-Key': session.apiKey }
        : {};

    const response = await fetch(url, {
      method: init.method ?? 'GET',
      headers: {
        ...credentialHeader,
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });

    const status = response.status;
    // `204 No Content` (disconnect/remove) nao tem corpo — `response.json()`
    // lancaria em cima de um body vazio; `text()` primeiro evita isso.
    const text = await response.text();
    const body = text ? (JSON.parse(text) as T) : (undefined as T);

    return { status, body };
  };
}

/**
 * Cliente HTTP do recurso `whatsapp-sessions` (M2, Fase 3 — BFF-2). A partir
 * do Bloco 6 (D21), e so o `createApiClient('whatsapp-sessions')` — a
 * assinatura publica e o comportamento permanecem EXATAMENTE os mesmos de
 * antes da extracao da factory; nenhum call site precisou mudar.
 */
export const callApi = createApiClient('whatsapp-sessions');

/** Cliente do recurso `conversations` (Milestone 3, Bloco 6 — D21/D22), consumido pelas rotas `pages/api/conversations/*`. */
export const callConversationsApi = createApiClient('conversations');

/** Cliente do recurso `ai-interactions` (Milestone 3, Bloco 6 — D21/D22), consumido por `pages/api/ai-interactions/*`. */
export const callAiInteractionsApi = createApiClient('ai-interactions');

/**
 * Cliente do recurso `sessions`, usado por Analytics por sessão (M6H-4,
 * 2026-07-26) — o path passado a `callAnalyticsApi` inclui o `sessionName`
 * (ex.: `/minha-sessao/analytics/ai-usage`), mesmo padrão já usado por
 * `callAiProfileApi`/`callApi` (avatar de contato). Read-only (D51).
 * Consumido por `pages/api/sessions/[sessionName]/analytics/*`.
 */
export const callAnalyticsApi = createApiClient('sessions');

/** Cliente do recurso `users` (Milestone 5, Bloco M5F-3 — o "RH"), consumido por `pages/api/users/*`. A API rejeita o plano maquina nessas rotas (human_required) — so sessao de PESSOA chega la. */
export const callUsersApi = createApiClient('users');

/**
 * Cliente do recurso `audit-logs` (Fase 1, Bloco F1.5 — painel de auditoria),
 * consumido por `pages/api/audit-logs/*`. Diferente de `callUsersApi`, a API
 * NAO rejeita o plano maquina aqui (so leitura) — mas o BFF so e alcancado
 * por sessao de PESSOA de qualquer forma (login via browser).
 */
export const callAuditLogsApi = createApiClient('audit-logs');

/**
 * Cliente do recurso `sessions` (base de `/api/tenants/:tenantId/sessions/...`),
 * usado pelo "Cérebro da IA" por sessão (M6H-3, 2026-07-25) — o path passado a
 * `callAiProfileApi` inclui o `sessionName` (ex.: `/minha-sessao/ai-profile`),
 * mesmo padrão já usado por `callApi` para o avatar de contato
 * (`/:sessionName/contacts/:contactJid/avatar`). RBAC (ai_profile:read/update)
 * imposto pela API.
 */
export const callAiProfileApi = createApiClient('sessions');

/**
 * Cliente do recurso `sessions`, usado pelas Respostas Rápidas por sessão
 * (Fase 1, Bloco F1.9) — o path passado a `callQuickRepliesApi` inclui o
 * `sessionName` (ex.: `/minha-sessao/quick-replies`), mesmo padrão já usado
 * por `callAiProfileApi`/`callAnalyticsApi`. RBAC (quick_reply:read/manage)
 * imposto pela API.
 */
export const callQuickRepliesApi = createApiClient('sessions');

/**
 * Cliente do recurso `sessions`, usado pelo CATÁLOGO de tags por sessão
 * (Redesign 2026-08-05, R4) — o path passado a `callTagsApi` inclui o
 * `sessionName` (ex.: `/minha-sessao/tags`), mesmo padrão já usado por
 * `callAiProfileApi`/`callQuickRepliesApi`. RBAC (tag:read/manage) imposto
 * pela API. A ATRIBUIÇÃO de tag a uma conversa (`POST`/`DELETE
 * /conversations/:id/tags/:tagId`) não tem cliente próprio — reusa
 * `callConversationsApi` (mesmo recurso `conversations`, mesma régua de
 * `message:send` já usada para mover card no Pipeline).
 */
export const callTagsApi = createApiClient('sessions');

/**
 * Cliente do recurso `contacts` (Fase L, Bloco L1b — importação de contatos),
 * consumido por `pages/api/contacts/*`. TENANT-WIDE (diferente de
 * `callTagsApi`/`callAiProfileApi`, cujo path inclui `sessionName`) —
 * `WhatsAppContact` não pertence a uma sessão, ver docstring do model no
 * `schema.prisma`. RBAC (contact:read/manage) imposto pela API.
 */
export const callContactsApi = createApiClient('contacts');

/**
 * Cliente do recurso `campaigns` (Fase L, Bloco L3 — criação e cálculo de
 * destinatários; NUNCA envia mensagem), consumido por `pages/api/campaigns/*`.
 * TENANT-WIDE na URL, mesmo padrão de `callContactsApi` — `sessionName` é um
 * campo do corpo, não da rota. RBAC (campaign:read/manage) imposto pela API.
 */
export const callCampaignsApi = createApiClient('campaigns');
