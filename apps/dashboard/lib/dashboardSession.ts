import { randomUUID, timingSafeEqual } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { encryptCookiePayload, decryptCookiePayload } from './cookieCipher';

export const SESSION_COOKIE_NAME = 'wa_dashboard_session';

/**
 * Cookie LEGÍVEL por JS que espelha o token CSRF guardado dentro do payload
 * cifrado da sessão (bloco B1).
 *
 * Como a defesa funciona: o token de verdade vive no cookie de sessão
 * cifrado (`csrfToken`), que o JS não consegue ler. Este segundo cookie
 * carrega o MESMO valor só para o Dashboard conseguir devolvê-lo no
 * cabeçalho `x-csrf-token`. O servidor compara cabeçalho × payload cifrado.
 *
 * Por que isso barra CSRF: um site atacante consegue FAZER o navegador
 * enviar os cookies do Francis numa requisição forjada, mas a política de
 * mesma origem o impede de LER qualquer um deles — logo não tem como montar
 * o cabeçalho. Requisição sem o cabeçalho correto é recusada.
 *
 * Mais forte que o "double-submit cookie" clássico (comparar dois cookies
 * entre si): aqui o lado autoritativo é o payload CIFRADO e assinado, que o
 * cliente não pode forjar — num double-submit puro, quem consegue gravar um
 * cookie no domínio (ex.: subdomínio comprometido) consegue fabricar os dois
 * lados da comparação.
 */
export const CSRF_COOKIE_NAME = 'wa_csrf_token';

/** Cabeçalho onde o Dashboard devolve o token lido de `CSRF_COOKIE_NAME`. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** 12 horas — prazo arbitrário, mas razoável para uma sessão de operador do Dashboard; fácil de ajustar depois (uma constante, sem migração). */
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Quem esta logado (plano PESSOA, M5F) — espelho do `PublicUser` da API no que o Dashboard precisa. `role` fica `string` aqui (o RBAC e imposto pela API; a UI so esconde botoes — M5F-3). */
export interface DashboardSessionUser {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  /** Reorganizacao Perfil/Configuracoes (2026-08-27) — ausentes ate o usuario preencher no Perfil. */
  name?: string;
  avatarUrl?: string;
  /**
   * Auditoria do Perfil (2026-08-28, `PERFIL_REDESIGN_PLAN.md` Fase 2) — a
   * API ja devolve `createdAt`/`lastLoginAt` em `PublicUser` desde sempre
   * (e' so `Omit<User, 'passwordHash'>`); o BFF simplesmente descartava os
   * dois campos ao montar `sessionUser` em login/register. ISO string (o
   * cookie e' JSON; `Date` nao sobrevive a serializacao).
   */
  createdAt?: string;
  lastLoginAt?: string;
}

/**
 * Payload da sessão do Dashboard, guardado SOMENTE dentro do cookie httpOnly
 * cifrado — nunca exposto ao JS do navegador, nunca devolvido em JSON.
 *
 * DOIS formatos coexistem (Milestone 5, Bloco M5F-1 — transicao sem quebra):
 * - MAQUINA (M2, Fase 3): `{ tenantId, apiKey }` — a API key de longo prazo
 *   do tenant. Continua funcionando exatamente como antes.
 * - PESSOA (M5F): `{ tenantId, accessToken, refreshToken, user }` — o cracha
 *   curto + a chave-reserva de renovacao, emitidos pelo login e-mail/senha.
 *
 * Invariante (validado em `readSessionFromRequest`): `apiKey` OU o par de
 * tokens — nunca nenhum dos dois.
 */
export interface DashboardSession {
  tenantId: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  user?: DashboardSessionUser;
  /**
   * Token CSRF desta sessão (bloco B1). Vive aqui, DENTRO do payload
   * cifrado — é o lado autoritativo da comparação; o cookie legível
   * (`CSRF_COOKIE_NAME`) é só o espelho que o JS consegue ler. Opcional
   * porque sessões criadas antes deste bloco não o têm: `requireSession`
   * emite um na primeira requisição delas, sem forçar re-login.
   */
  csrfToken?: string;
}

/** A sessao e do plano PESSOA (tokens)? Type guard usado por `requireSession`/`apiClient`. */
export function isUserSession(session: DashboardSession): session is DashboardSession & {
  accessToken: string;
  refreshToken: string;
  user: DashboardSessionUser;
} {
  return typeof session.accessToken === 'string' && typeof session.refreshToken === 'string';
}

function getSessionSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'DASHBOARD_SESSION_SECRET não configurada — gere uma chave com `openssl rand -base64 32` e defina-a no .env (ver .env.example).',
    );
  }
  return secret;
}

/**
 * Serializa o cabeçalho `Set-Cookie` manualmente (sem depender do pacote
 * `cookie`, que não é uma dependência direta deste app — evita adicionar
 * uma dependência nova só para um único cookie). httpOnly + `SameSite=Lax`
 * sempre; `Secure` só em produção (permite `npm run dev` em `http://localhost`
 * sem HTTPS local).
 */
function serializeCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  { httpOnly }: { httpOnly: boolean },
): string {
  const parts = [`${name}=${value}`, 'Path=/', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
  if (httpOnly) {
    parts.splice(2, 0, 'HttpOnly');
  }
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

/**
 * ~4096 bytes é o teto prático de UM cookie no navegador (RFC 6265 §6.1
 * recomenda suportar ao menos isso; Chrome/Firefox cortam por aí). Acima
 * disso o navegador DESCARTA o `Set-Cookie` inteiro, em silêncio — a sessão
 * nunca "cola" e o usuário fica preso num loop `/login` ⇄ `/` (bug real de
 * 2026-08-28: `user.avatarUrl` era uma `data:` URI de ~22 KB dentro do
 * payload, gerando um `Set-Cookie` de 30 KB). Ficamos com folga abaixo do
 * limite.
 */
const MAX_SAFE_COOKIE_VALUE_BYTES = 3800;

/**
 * Remove do payload do cookie os campos que podem ser grandes demais. Hoje
 * só `user.avatarUrl` — uma `data:` URI de foto de perfil de até ~200 KB
 * (comprimida no cliente, ver `ProfileSettingsTab`/`EditableAvatar` e o teto
 * de `updateProfileBodySchema` na API). O cookie carrega apenas identidade
 * essencial + tokens; a foto é dado de EXIBIÇÃO e vem fresca de
 * `/api/auth/me` (que consulta a API). `avatarUrl` ausente = nada a fazer.
 */
function toCookieSafeSession(session: DashboardSession): DashboardSession {
  if (!session.user || session.user.avatarUrl === undefined) {
    return session;
  }
  const { avatarUrl: _dropped, ...user } = session.user;
  return { ...session, user };
}

/**
 * Grava o cookie de sessão cifrado na resposta — chamado por
 * `pages/api/auth/{login,register,me,change-password}.ts`.
 *
 * Bloco B1 — grava TAMBÉM o cookie legível do token CSRF, com o mesmo valor
 * que vai dentro do payload cifrado. Ver `CSRF_COOKIE_NAME` para o desenho.
 */
export function setSessionCookie(res: NextApiResponse, session: DashboardSession): void {
  const withCsrf: DashboardSession = session.csrfToken
    ? session
    : { ...session, csrfToken: randomUUID() };
  const encrypted = encryptCookiePayload(
    getSessionSecret(),
    JSON.stringify(toCookieSafeSession(withCsrf)),
  );
  if (encrypted.length > MAX_SAFE_COOKIE_VALUE_BYTES) {
    // Não lança (não quebrar o login) — mas registra: um cookie desse tamanho
    // pode ser descartado pelo navegador e derrubar a sessão silenciosamente.
    console.warn(
      `[dashboardSession] cookie de sessão com ${encrypted.length} bytes ultrapassa o teto seguro de ${MAX_SAFE_COOKIE_VALUE_BYTES}; o navegador pode descartá-lo. Verifique o que está sendo colocado no payload.`,
    );
  }
  res.setHeader('Set-Cookie', [
    serializeCookie(SESSION_COOKIE_NAME, encrypted, SESSION_MAX_AGE_SECONDS, { httpOnly: true }),
    // NÃO httpOnly de propósito: o JS do Dashboard precisa LER este valor
    // para devolvê-lo no cabeçalho. É seguro — o token não dá acesso a nada
    // sozinho; ele só prova que quem montou a requisição consegue ler
    // cookies deste domínio, o que um site atacante não consegue.
    serializeCookie(CSRF_COOKIE_NAME, withCsrf.csrfToken ?? '', SESSION_MAX_AGE_SECONDS, {
      httpOnly: false,
    }),
  ]);
}

/** Expira os cookies imediatamente (`Max-Age=0`) — chamado só por `pages/api/auth/logout.ts`. */
export function clearSessionCookie(res: NextApiResponse): void {
  res.setHeader('Set-Cookie', [
    serializeCookie(SESSION_COOKIE_NAME, '', 0, { httpOnly: true }),
    serializeCookie(CSRF_COOKIE_NAME, '', 0, { httpOnly: false }),
  ]);
}

/**
 * Lê e decifra a sessão do cookie da requisição. Retorna `null` (nunca
 * lança) quando o cookie está ausente, corrompido, ou a variável
 * `DASHBOARD_SESSION_SECRET` não está configurada — todas as rotas
 * protegidas tratam `null` da mesma forma: `401 { error: 'not_authenticated' }`.
 * Nunca reimplementado em cada rota — único ponto de leitura do cookie.
 *
 * Assinatura recebe só `Pick<NextApiRequest, 'cookies'>` (M2, Fase 4), não
 * `NextApiRequest` inteiro — alargamento puramente aditivo para também
 * aceitar `GetServerSidePropsContext['req']` (usado por `lib/auth.ts` para
 * proteger páginas, não só rotas `pages/api/*`), que tem `cookies` mas não
 * `body`/`query`. Todo chamador existente que já passava um `NextApiRequest`
 * completo continua satisfazendo esse tipo mais estreito sem nenhuma
 * mudança de comportamento.
 */
export function readSessionFromRequest(
  req: Pick<NextApiRequest, 'cookies'>,
): DashboardSession | null {
  const raw = req.cookies[SESSION_COOKIE_NAME];
  if (!raw) {
    return null;
  }

  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }

  const decrypted = decryptCookiePayload(secret, raw);
  if (!decrypted) {
    return null;
  }

  try {
    const parsed = JSON.parse(decrypted) as Partial<DashboardSession>;
    if (typeof parsed.tenantId !== 'string') {
      return null;
    }
    // Bloco B1 — o token CSRF atravessa os dois formatos de sessão. Esta
    // função reconstrói o objeto campo a campo (whitelist deliberada, para
    // um payload adulterado não injetar chaves inesperadas), então um campo
    // novo só existe do outro lado se for lido explicitamente aqui.
    const csrfToken = typeof parsed.csrfToken === 'string' ? parsed.csrfToken : undefined;

    // Plano MAQUINA (formato original, M2): tenantId + apiKey.
    if (typeof parsed.apiKey === 'string') {
      return { tenantId: parsed.tenantId, apiKey: parsed.apiKey, csrfToken };
    }
    // Plano PESSOA (M5F-1): tenantId + tokens + user.
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string' &&
      parsed.user &&
      typeof parsed.user.id === 'string' &&
      typeof parsed.user.email === 'string' &&
      typeof parsed.user.role === 'string'
    ) {
      return {
        tenantId: parsed.tenantId,
        accessToken: parsed.accessToken,
        refreshToken: parsed.refreshToken,
        csrfToken,
        user: {
          id: parsed.user.id,
          email: parsed.user.email,
          role: parsed.user.role,
          mustChangePassword: parsed.user.mustChangePassword === true,
          name: typeof parsed.user.name === 'string' ? parsed.user.name : undefined,
          avatarUrl:
            typeof parsed.user.avatarUrl === 'string' ? parsed.user.avatarUrl : undefined,
          createdAt:
            typeof parsed.user.createdAt === 'string' ? parsed.user.createdAt : undefined,
          lastLoginAt:
            typeof parsed.user.lastLoginAt === 'string' ? parsed.user.lastLoginAt : undefined,
        },
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Le o `exp` (epoch em SEGUNDOS) do payload do access token SEM verificar a
 * assinatura — verificar e papel da API (que tem o segredo); o BFF so precisa
 * saber QUANDO renovar. Devolve `null` para token malformado (o chamador
 * trata como "renova ja").
 */
export function getAccessTokenExpiration(accessToken: string): number | null {
  const segments = accessToken.split('.');
  if (segments.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** Margem de renovacao: renova quando faltar MENOS que isso para o cracha vencer (evita usar um token que morre no meio da chamada proxy). */
const REFRESH_MARGIN_SECONDS = 60;

function needsRefresh(session: DashboardSession & { accessToken: string }, nowMs: number): boolean {
  const exp = getAccessTokenExpiration(session.accessToken);
  if (exp === null) {
    return true; // malformado — tenta renovar; se falhar, cai no 401
  }
  return exp * 1000 - nowMs < REFRESH_MARGIN_SECONDS * 1000;
}

/**
 * HOTFIX 2026-08-25 — achado real: uma página do Dashboard abre VÁRIAS
 * conexões SSE ao mesmo tempo (Conversas, Sessões, Mensagens, Interações de
 * IA...), cada uma chamando `requireSession` de forma independente. Quando
 * o access token de todas elas precisa renovar no MESMO instante (ex.: logo
 * depois de um redeploy do Dashboard, que derruba e reconecta TODAS as
 * conexões SSE de uma vez — `EventSource` reconecta sozinho a qualquer
 * encerramento, ver `SSE_MAX_LIFETIME_MS`), cada uma lia o MESMO
 * `refreshToken` do cookie (ainda não atualizado por nenhuma das outras) e
 * disparava sua PRÓPRIA chamada a `POST /auth/refresh`, em paralelo.
 *
 * `RefreshTokenService.refresh` (`apps/api`) só permite um refresh token
 * ser consumido UMA vez — a segunda chamada em diante, usando o MESMO
 * token já consumido pela primeira que chegou, cai no ramo de detecção de
 * reuso (`reason: 'reuse_detected'`), que REVOGA TODOS os refresh tokens do
 * usuário de propósito (defesa contra roubo de token) — derrubando a
 * sessão inteira. Medido no Postgres: múltiplas linhas de `refresh_tokens`
 * criadas/revogadas em menos de 200ms, mesmo usuário, coerente com essa
 * corrida.
 *
 * Correção: um Map em memória, por PROCESSO (`next start` roda como
 * processo único e persistente, não serverless-por-requisição — a
 * suposição já documentada para `KeyedMutex`/rate limiters em memória
 * deste projeto), dedupa chamadas concorrentes que apresentam o MESMO
 * `refreshToken` — a primeira dispara a chamada real; todas as demais
 * esperam a MESMA Promise e recebem o MESMO resultado, em vez de cada uma
 * tentar consumir o token por conta própria. Limitação aceita (mesma
 * classe já documentada nesta base): só protege dentro de UM processo —
 * se o Dashboard escalar horizontalmente, precisa virar um lock
 * distribuído (Redis), mesma ressalva já registrada para `KeyedMutex`.
 */
const inFlightRefreshes = new Map<string, Promise<DashboardSession | null>>();

/**
 * Renova o par de tokens na API (`POST /auth/refresh`). Devolve a sessao nova
 * ou `null` se a API recusou (refresh vencido/revogado/reuso detectado) ou
 * esta inacessivel — em ambos os casos o chamador derruba a sessao (401).
 * `import()` dinamico de `getApiBaseUrl` evitaria ciclo, mas o ciclo aqui e
 * inofensivo: `apiClient` importa deste arquivo APENAS TIPOS (apagados em
 * runtime), entao o import de valor abaixo nao forma ciclo real.
 */
async function refreshUserSession(
  session: DashboardSession & {
    accessToken: string;
    refreshToken: string;
    user: DashboardSessionUser;
  },
): Promise<DashboardSession | null> {
  const existing = inFlightRefreshes.get(session.refreshToken);
  if (existing) {
    return existing;
  }

  const promise = performRefreshRequest(session).finally(() => {
    inFlightRefreshes.delete(session.refreshToken);
  });
  inFlightRefreshes.set(session.refreshToken, promise);
  return promise;
}

async function performRefreshRequest(
  session: DashboardSession & {
    accessToken: string;
    refreshToken: string;
    user: DashboardSessionUser;
  },
): Promise<DashboardSession | null> {
  const { getApiBaseUrl } = await import('./apiClient');
  let response: Response;
  try {
    response = await fetch(
      new URL(`/api/tenants/${encodeURIComponent(session.tenantId)}/auth/refresh`, getApiBaseUrl()),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      },
    );
  } catch {
    return null;
  }
  if (!response.ok) {
    return null;
  }
  try {
    const body = (await response.json()) as { accessToken?: unknown; refreshToken?: unknown };
    if (typeof body.accessToken !== 'string' || typeof body.refreshToken !== 'string') {
      return null;
    }
    return { ...session, accessToken: body.accessToken, refreshToken: body.refreshToken };
  } catch {
    return null;
  }
}

/**
 * Helper compartilhado (M2, Fase 3 — BFF-2) para as rotas proxy/SSE: lê a
 * sessão e, se ausente/inválida, já responde `401 { error: 'not_authenticated' }`
 * e devolve `null` — o chamador só precisa checar `if (!session) return;`,
 * sem repetir esse bloco em cada uma das ~7 rotas que dependem dele. Mesmo
 * padrão já usado em `validateOrRespond()` no router Express de `apps/api`
 * (Bloco 7): centraliza "validar e já responder no caminho de falha" num
 * único lugar.
 *
 * ASYNC a partir do M5F-1 — RENOVACAO PROATIVA do cracha: para sessao de
 * PESSOA, se o access token esta a menos de 60s de vencer, renova AQUI (unico
 * ponto que tem `req` E `res` e roda no inicio de toda rota proxy) e regrava
 * o cookie com os tokens rotacionados — as 17 rotas nem ficam sabendo; nenhum
 * retry espalhado. Se a renovacao falhar (refresh revogado/vencido — ex.:
 * usuario suspenso pelo RH do M5E), derruba a sessao: cookie limpo + 401, e o
 * front manda para o login. Sessao de MAQUINA (API key) passa direto, como
 * sempre (zero mudanca de comportamento para o fluxo atual).
 */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defesa de CSRF (R6 da auditoria de seguranca, 2026-08-26) — checagem de
 * `Origin` (com fallback a `Referer`) contra o proprio `Host` da requisicao,
 * so em metodos MUTANTES. Deliberadamente LEVE (nao um token CSRF de dupla
 * submissao): `SameSite=Lax` ja bloqueia a maioria dos casos; isto fecha a
 * lacuna que o Lax NAO cobre (subdominio comprometido, navegador antigo sem
 * SameSite). So REJEITA quando o header esta PRESENTE e diverge — ausencia
 * de Origin (chamadas same-site legitimas, curl, testes) continua permitida,
 * para nao quebrar nada que hoje funciona.
 */
function failsOriginCheck(req: NextApiRequest): boolean {
  if (!MUTATING_METHODS.has(req.method ?? '')) {
    return false;
  }
  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin) {
    return false;
  }
  const host = req.headers.host;
  if (!host) {
    return false;
  }
  try {
    const originHost = new URL(origin).host;
    return originHost !== host;
  } catch {
    return true; // Origin/Referer malformado — trata como suspeito.
  }
}

/** Compara em tempo constante — evita descobrir o token byte a byte pelo tempo de resposta. */
function tokensMatch(expected: string, presented: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  // `timingSafeEqual` exige o mesmo comprimento; comparar antes já vaza o
  // tamanho, o que é inofensivo (o token tem tamanho fixo conhecido).
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verificação do token CSRF, só em métodos MUTANTES (bloco B1).
 *
 * Substitui `failsOriginCheck` como defesa principal — aquela continua
 * ativa como camada adicional, mas tinha um buraco por desenho: permitia
 * requisições SEM `Origin`/`Referer`, então bastava ao atacante montar um
 * pedido que não enviasse o cabeçalho para contorná-la.
 */
function failsCsrfCheck(req: NextApiRequest, session: DashboardSession): boolean {
  if (!MUTATING_METHODS.has(req.method ?? '')) {
    return false;
  }
  if (!session.csrfToken) {
    // Sessão anterior ao bloco B1: não há token com que comparar. Deixa
    // passar UMA vez — `requireSession` emite um token logo em seguida, e a
    // próxima requisição desta sessão já é verificada. Alternativa seria
    // recusar, o que deslogaria todo mundo no deploy.
    return false;
  }
  const presented = req.headers[CSRF_HEADER_NAME];
  const token = Array.isArray(presented) ? presented[0] : presented;
  if (!token) {
    return true;
  }
  return !tokensMatch(session.csrfToken, token);
}

export async function requireSession(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<DashboardSession | null> {
  if (failsOriginCheck(req)) {
    res.status(403).json({ error: 'cross_origin_request_blocked' });
    return null;
  }

  const session = readSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'not_authenticated' });
    return null;
  }

  if (failsCsrfCheck(req, session)) {
    res.status(403).json({ error: 'invalid_csrf_token' });
    return null;
  }

  // Migração silenciosa das sessões criadas antes do bloco B1: emite o token
  // agora para que, a partir da próxima requisição, a verificação acima passe
  // a valer de fato. Sem retorno antecipado — a renovação do access token
  // abaixo continua acontecendo nesta mesma requisição.
  let current = session;
  if (!current.csrfToken) {
    current = { ...current, csrfToken: randomUUID() };
    setSessionCookie(res, current);
  }

  if (!isUserSession(current)) {
    return current;
  }
  if (!needsRefresh(current, Date.now())) {
    return current;
  }

  const refreshed = await refreshUserSession(current);
  if (!refreshed) {
    clearSessionCookie(res);
    res.status(401).json({ error: 'not_authenticated' });
    return null;
  }
  setSessionCookie(res, refreshed);
  return refreshed;
}
