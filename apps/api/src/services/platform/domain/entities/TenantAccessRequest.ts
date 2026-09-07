/**
 * Pedido de ACESSO ASSISTIDO do dono da plataforma a um tenant — Painel
 * `/admin`, Fase 5 (`ADMIN_PLATFORM_MASTER_PLAN.md` §9).
 *
 * Ciclo: o fundador pede (`pending`, com um motivo escrito) → o cliente
 * (dono/administrador) autoriza (`accepted`, prazo de 2h) ou recusa
 * (`denied`) → durante a janela o cliente pode revogar (`revoked`) e o
 * fundador pode encerrar ao sair (`ended`); passado o prazo, `expired`.
 *
 * Um registro por pedido, mantido PARA SEMPRE (recusas também são
 * informação). Não é entidade de negócio do produto — é do painel do dono.
 */
export type SupportAccessStatus =
  | 'pending'
  | 'accepted'
  | 'denied'
  | 'expired'
  | 'revoked'
  | 'ended';

export interface TenantAccessRequest {
  id: string;
  tenantId: string;
  /** `PlatformUser` que pediu. */
  platformUserId: string;
  /** O que o cliente lê antes de decidir, e o que fica gravado. */
  reason: string;
  status: SupportAccessStatus;
  requestedAt: Date;
  respondedAt: Date | null;
  /** `User` do tenant que autorizou/recusou/revogou. `null` enquanto `pending`. */
  respondedByUserId: string | null;
  /** Preenchido só ao autorizar: `respondedAt + 2h`. */
  expiresAt: Date | null;
}

/** Duração da janela de acesso — §9.1 passo 3. */
export const SUPPORT_ACCESS_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * O acesso está VÁLIDO agora? `accepted` E dentro do prazo. É a checagem que
 * o porteiro (`authenticate`, plano `support`) faz no banco a cada requisição
 * — Regra inviolável 1 (§9.3).
 */
export function isSupportAccessLive(request: TenantAccessRequest, now: Date): boolean {
  return (
    request.status === 'accepted' &&
    request.expiresAt !== null &&
    request.expiresAt.getTime() > now.getTime()
  );
}

/**
 * O pedido ainda "ocupa a vaga" do tenant? `pending`, ou `accepted` dentro do
 * prazo. Usado para impedir dois pedidos simultâneos para o mesmo tenant.
 */
export function isSupportAccessActiveOrPending(
  request: TenantAccessRequest,
  now: Date,
): boolean {
  return request.status === 'pending' || isSupportAccessLive(request, now);
}
