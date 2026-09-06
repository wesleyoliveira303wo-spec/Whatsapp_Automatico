/**
 * Estado de ACESSO de um `Tenant` — a Trava de acesso do Painel /admin,
 * Fase 4 (`ADMIN_PLATFORM_MASTER_PLAN.md` §8).
 *
 * `active`    — funciona normalmente.
 * `suspended` — o tenant inteiro deixa de logar (checado no `AuthService`,
 *               login e refresh). O dono do app suspende/reativa pelo `/admin`.
 *
 * Distinto de `plan`: `plan` responde "o que ele pode fazer", `status`
 * responde "ele pode entrar". São perguntas diferentes e não dividem um
 * campo (ver §8 do plano mestre). Localização em `shared/tenant` pelo mesmo
 * motivo de `TenantPlan`: conceito transversal, lido por `services/auth`.
 *
 * Mapeia o enum Prisma `UserStatus` (`ACTIVE`/`SUSPENDED`), reaproveitado
 * pela migration — mesmo par de valores, sem enum paralelo.
 */
export type TenantStatus = 'active' | 'suspended';
