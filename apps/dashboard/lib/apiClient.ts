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
    init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
  ): Promise<ApiResponse<T>> {
    const baseUrl = getApiBaseUrl();
    const url = new URL(`/api/tenants/${encodeURIComponent(session.tenantId)}/${resource}${path}`, baseUrl);

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

/** Cliente do recurso `analytics` (Milestone 4, Bloco M4D — ADR #59), consumido por `pages/api/analytics/*`. Read-only (D51). */
export const callAnalyticsApi = createApiClient('analytics');

/** Cliente do recurso `users` (Milestone 5, Bloco M5F-3 — o "RH"), consumido por `pages/api/users/*`. A API rejeita o plano maquina nessas rotas (human_required) — so sessao de PESSOA chega la. */
export const callUsersApi = createApiClient('users');

/** Cliente do recurso `ai-profile` (Base de Conhecimento, Nível 1 — o "Cérebro da IA"), consumido por `pages/api/ai-profile/*`. RBAC (ai_profile:read/update) imposto pela API. */
export const callAiProfileApi = createApiClient('ai-profile');
