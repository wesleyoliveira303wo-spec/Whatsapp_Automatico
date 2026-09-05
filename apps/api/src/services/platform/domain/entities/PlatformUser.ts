/**
 * O dono da PLATAFORMA — Fase 1 do `/admin`
 * (`ADMIN_PLATFORM_MASTER_PLAN.md` §3.1).
 *
 * NÃO é um `User`. Um `User` pertence obrigatoriamente a um tenant e todos os
 * cinco cargos são escopados a um tenant; um `PlatformUser` não pertence a
 * nenhum e existe justamente para atravessá-los. Os dois tipos nunca se
 * convertem um no outro — é essa separação que impede um bug de RBAC de
 * transformar um cliente em administrador da plataforma.
 *
 * Sem `role`: quem chega aqui já tem tudo. Distinção de poderes entre admins
 * só faz sentido quando existir um segundo admin (YAGNI).
 *
 * `passwordHash` NUNCA sai desta camada — ver `PublicPlatformUser`.
 */
export interface PlatformUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  status: 'active' | 'suspended';
  lastLoginAt?: Date;
  createdAt: Date;
}

/**
 * O que pode cruzar a fronteira HTTP. Existe para tornar o vazamento de
 * `passwordHash` um erro de compilação, não uma questão de disciplina —
 * mesmo padrão de `PublicUser` em `services/auth`.
 */
export interface PublicPlatformUser {
  id: string;
  email: string;
  name: string;
}

export function toPublicPlatformUser(user: PlatformUser): PublicPlatformUser {
  return { id: user.id, email: user.email, name: user.name };
}
