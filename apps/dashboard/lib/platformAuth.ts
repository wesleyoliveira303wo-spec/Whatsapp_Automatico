import type { GetServerSidePropsContext } from 'next';

import { readPlatformSessionFromRequest, type PlatformSession } from './platformSession';

/**
 * Guarda das páginas do `/admin` — Fase 1. Gêmeo de `lib/auth.ts`, separado
 * pelo mesmo motivo dos cookies: um porteiro por superfície.
 *
 * O que ela garante é modesto de propósito: que existe um cookie de
 * plataforma legítimo, para a página não piscar antes de redirecionar. A
 * autorização de verdade acontece no servidor a cada chamada de `/api/platform`
 * (§4: "a UI esconder um botão nunca é o controle").
 */
export type PlatformPageGuard =
  | { kind: 'ok'; session: PlatformSession }
  | { kind: 'redirect'; redirect: { destination: string; permanent: false } };

export function requirePlatformPageSession(
  context: GetServerSidePropsContext,
): PlatformPageGuard {
  const session = readPlatformSessionFromRequest(context.req);
  if (!session) {
    return { kind: 'redirect', redirect: { destination: '/admin/login', permanent: false } };
  }
  return { kind: 'ok', session };
}
