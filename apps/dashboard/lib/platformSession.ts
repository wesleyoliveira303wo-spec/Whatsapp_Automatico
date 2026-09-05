import { randomUUID, timingSafeEqual } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

import { encryptCookiePayload, decryptCookiePayload } from './cookieCipher';

/**
 * Sessão do `/admin` — Fase 1 (`ADMIN_PLATFORM_MASTER_PLAN.md` §3.2).
 *
 * Este arquivo é o gêmeo de `dashboardSession.ts`, e a duplicação é o ponto:
 * são DOIS porteiros que nunca devem se cruzar. Cookie próprio, token CSRF
 * próprio, segredo próprio, leitura própria. Fundir os dois num só módulo com
 * um parâmetro "modo" faria a separação entre o painel do dono e o produto do
 * cliente depender de um `if` — exatamente o tipo de erro que vaza dado entre
 * contas.
 */
export const PLATFORM_SESSION_COOKIE_NAME = 'wa_admin_session';

/** Espelho legível do token CSRF — mesmo desenho do produto (bloco B1). */
export const PLATFORM_CSRF_COOKIE_NAME = 'wa_admin_csrf';

export const PLATFORM_CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * 8 horas (§4). Mais curta que as 12h do produto de propósito: esta é a
 * sessão que atravessa todos os clientes.
 */
const PLATFORM_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface PlatformSessionUser {
  id: string;
  email: string;
  name: string;
}

export interface PlatformSession {
  /** Crachá emitido pela API; viaja como `Bearer` para `/api/platform/...`. */
  token: string;
  user: PlatformSessionUser;
  csrfToken?: string;
}

function getSessionSecret(): string {
  // Segredo PRÓPRIO em dois sentidos: não é o `DASHBOARD_SESSION_SECRET` (que
  // cifra o cookie do produto) e não é o `PLATFORM_SESSION_SECRET` (que a API
  // usa para ASSINAR o crachá). Cada segredo serve a um propósito só — é o
  // mesmo critério que já separa `DASHBOARD_SESSION_SECRET` de
  // `ACCESS_TOKEN_SECRET` no produto.
  const secret = process.env.PLATFORM_DASHBOARD_SESSION_SECRET;
  if (!secret) {
    throw new Error(
      'PLATFORM_DASHBOARD_SESSION_SECRET não configurada — gere uma chave com `openssl rand -base64 32` e defina-a no .env (ver .env.example).',
    );
  }
  return secret;
}

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

export function setPlatformSessionCookie(res: NextApiResponse, session: PlatformSession): void {
  const withCsrf: PlatformSession = session.csrfToken
    ? session
    : { ...session, csrfToken: randomUUID() };
  const encrypted = encryptCookiePayload(getSessionSecret(), JSON.stringify(withCsrf));
  res.setHeader('Set-Cookie', [
    serializeCookie(PLATFORM_SESSION_COOKIE_NAME, encrypted, PLATFORM_SESSION_MAX_AGE_SECONDS, {
      httpOnly: true,
    }),
    serializeCookie(
      PLATFORM_CSRF_COOKIE_NAME,
      withCsrf.csrfToken ?? '',
      PLATFORM_SESSION_MAX_AGE_SECONDS,
      { httpOnly: false },
    ),
  ]);
}

export function clearPlatformSessionCookie(res: NextApiResponse): void {
  res.setHeader('Set-Cookie', [
    serializeCookie(PLATFORM_SESSION_COOKIE_NAME, '', 0, { httpOnly: true }),
    serializeCookie(PLATFORM_CSRF_COOKIE_NAME, '', 0, { httpOnly: false }),
  ]);
}

/**
 * Lê e decifra a sessão do `/admin`. Nunca lança — cookie ausente,
 * corrompido, adulterado ou segredo faltando devolvem `null`, e todo chamador
 * trata `null` do mesmo jeito.
 *
 * Reconstrói o objeto campo a campo (whitelist deliberada, mesmo cuidado de
 * `readSessionFromRequest`): um payload adulterado não injeta chave nenhuma.
 */
export function readPlatformSessionFromRequest(
  req: Pick<NextApiRequest, 'cookies'>,
): PlatformSession | null {
  const raw = req.cookies[PLATFORM_SESSION_COOKIE_NAME];
  if (!raw) return null;

  let secret: string;
  try {
    secret = getSessionSecret();
  } catch {
    return null;
  }

  const decrypted = decryptCookiePayload(secret, raw);
  if (!decrypted) return null;

  try {
    const parsed = JSON.parse(decrypted) as Partial<PlatformSession>;
    if (typeof parsed.token !== 'string' || !parsed.user) return null;
    if (
      typeof parsed.user.id !== 'string' ||
      typeof parsed.user.email !== 'string' ||
      typeof parsed.user.name !== 'string'
    ) {
      return null;
    }
    return {
      token: parsed.token,
      user: { id: parsed.user.id, email: parsed.user.email, name: parsed.user.name },
      csrfToken: typeof parsed.csrfToken === 'string' ? parsed.csrfToken : undefined,
    };
  } catch {
    return null;
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function tokensMatch(expected: string, presented: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(presented, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

function failsOriginCheck(req: NextApiRequest): boolean {
  if (!MUTATING_METHODS.has(req.method ?? '')) return false;
  const origin = req.headers.origin ?? req.headers.referer;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * Diferença deliberada em relação ao produto: aqui uma sessão SEM token CSRF
 * é recusada, em vez de passar uma vez. Lá a tolerância existia para não
 * deslogar todo mundo num deploy; aqui não há base instalada de sessões
 * antigas — o `/admin` está nascendo —, então não há motivo para abrir mão da
 * verificação nem por uma requisição.
 */
function failsCsrfCheck(req: NextApiRequest, session: PlatformSession): boolean {
  if (!MUTATING_METHODS.has(req.method ?? '')) return false;
  if (!session.csrfToken) return true;
  const presented = req.headers[PLATFORM_CSRF_HEADER_NAME];
  const token = Array.isArray(presented) ? presented[0] : presented;
  if (!token) return true;
  return !tokensMatch(session.csrfToken, token);
}

/**
 * Porteiro das rotas `pages/api/platform/*`. Devolve `null` já tendo
 * respondido — o chamador só checa `if (!session) return;`.
 *
 * Note o que ele NÃO faz: não renova nada. A sessão do `/admin` é curta e
 * expira de vez; renovar em silêncio uma credencial que atravessa todos os
 * clientes é exatamente o que não se quer.
 */
export function requirePlatformSession(
  req: NextApiRequest,
  res: NextApiResponse,
): PlatformSession | null {
  if (failsOriginCheck(req)) {
    res.status(403).json({ error: 'cross_origin_request_blocked' });
    return null;
  }

  const session = readPlatformSessionFromRequest(req);
  if (!session) {
    res.status(401).json({ error: 'not_authenticated' });
    return null;
  }

  if (failsCsrfCheck(req, session)) {
    res.status(403).json({ error: 'invalid_csrf_token' });
    return null;
  }

  return session;
}
