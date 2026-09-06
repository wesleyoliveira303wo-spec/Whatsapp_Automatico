import type { GetServerSidePropsContext } from 'next';
import { readSessionFromRequest, withSupportUser, type DashboardSession } from './dashboardSession';

/**
 * Lê a sessão do Dashboard a partir de `getServerSideProps` (M2, Fase 4 —
 * guarda de autenticação das páginas). Reaproveita `readSessionFromRequest`
 * (Fase 3, BFF-1) — nenhuma lógica de cookie/cifra nova; só adapta ONDE ela
 * é chamada a partir de (`GetServerSidePropsContext.req`, não
 * `NextApiRequest`).
 *
 * `context.req` no Pages Router é tipado como
 * `IncomingMessage & { cookies: NextApiRequestCookies }` — estruturalmente
 * compatível com `Pick<NextApiRequest, 'cookies'>` (o único campo que
 * `readSessionFromRequest` de fato lê), mas não com `NextApiRequest`
 * inteiro (que também exige `body`/`query`/etc., ausentes em `req` de
 * página). Por isso `readSessionFromRequest` foi alargada (Fase 4) para
 * aceitar `Pick<NextApiRequest, 'cookies'>` em vez de `NextApiRequest`
 * completo — mudança de tipo puramente aditiva/mais permissiva: todo
 * chamador que já passava um `NextApiRequest` continua compilando sem
 * nenhuma mudança de comportamento em runtime.
 */
export function requirePageSession(context: GetServerSidePropsContext): DashboardSession | null {
  const session = readSessionFromRequest(context.req);
  // Fase 5 — sessão de suporte ganha um `user` sintético (owner) para os
  // gates de EXIBIÇÃO não esconderem telas do admin operando o tenant.
  return session ? withSupportUser(session) : null;
}

/** Redirect de página protegida — união discriminada para o TS narrowear a sessão no caminho feliz. */
export type ProtectedPageGuard =
  | { kind: 'ok'; session: DashboardSession }
  | { kind: 'redirect'; redirect: { destination: string; permanent: false } };

/**
 * Guarda das páginas PROTEGIDAS (Milestone 5, Bloco M5F-2). Além do
 * "sem sessão -> /login" que cada página fazia por conta própria, adiciona o
 * PORTÃO DA SENHA PROVISÓRIA: usuário com `mustChangePassword` só anda até
 * `/change-password` — não navega pelo resto do Dashboard enquanto não
 * trocar. Centralizado aqui para a regra viver num lugar só (as páginas
 * apenas repassam o redirect), mesmo racional do `requireSession` nas rotas
 * proxy. Sessão de MÁQUINA (API key) não tem usuário, logo nunca cai no
 * portão — comportamento pré-M5F intacto.
 */
export function requireProtectedPageSession(
  context: GetServerSidePropsContext,
): ProtectedPageGuard {
  const session = requirePageSession(context);
  if (!session) {
    return { kind: 'redirect', redirect: { destination: '/login', permanent: false } };
  }
  if (session.user?.mustChangePassword) {
    return { kind: 'redirect', redirect: { destination: '/change-password', permanent: false } };
  }
  return { kind: 'ok', session };
}
