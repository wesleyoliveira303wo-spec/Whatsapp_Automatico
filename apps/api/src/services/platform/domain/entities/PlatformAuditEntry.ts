/**
 * Um registro da trilha da PLATAFORMA — o que o dono do app fez SOBRE os
 * tenants (`ADMIN_PLATFORM_MASTER_PLAN.md` §11).
 *
 * Distinta da trilha do tenant (`AuditLog`, `services/auth`), que registra o
 * que acontece DENTRO de uma conta. Três motivos para não serem a mesma
 * tabela: o ator é de outro tipo, o público que lê é outro, e esta precisa
 * SOBREVIVER à exclusão do tenant que auditou.
 *
 * Append-only: sem `updatedAt`, sem update, sem delete — mesmo contrato de
 * `AuditLog`/`WhatsAppSessionEvent`.
 */
export interface PlatformAuditEntry {
  id: string;
  platformUserId: string;
  action: PlatformAuditAction;
  /** Tenant alvo, quando a ação tem um. Login não tem. */
  tenantId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  occurredAt: Date;
}

/**
 * Ações catalogadas. Union de strings (não enum do Prisma) de propósito:
 * ação nova não deve exigir migration numa tabela append-only — mesmo
 * racional de `AuditLog.action` e de `ContactConsentEvent.reason`.
 */
export type PlatformAuditAction =
  | 'platform.login'
  | 'platform.login_failed'
  | 'platform.logout'
  | 'platform.password_reset'
  // Fases seguintes (§15) — declaradas aqui para o catálogo viver num lugar só.
  | 'tenant.plan_changed'
  | 'tenant.suspended'
  | 'tenant.reactivated'
  | 'support.access_requested'
  | 'support.access_granted'
  | 'support.access_denied'
  | 'support.access_ended';
