/**
 * Papel (cargo) de um usuario dentro de um tenant — Milestone 5, Bloco M5A.
 * Uniao literal (nao `string` livre), mesmo racional do F6/ADR #15 ja
 * aplicado a `WhatsAppSession.status`/`AiInteraction.provider`. RBAC FIXO em
 * codigo (D55): este conjunto e fechado e versionado junto com o codigo. O
 * mapa papel->permissoes e escopo do M5D; aqui so existe o rotulo.
 */
export type UserRole = 'owner' | 'administrator' | 'manager' | 'operator' | 'read_only';

/**
 * Estado de uma conta. `suspended` bloqueia o login sem apagar a ficha —
 * preserva historico/auditoria (soft-disable), mesmo espirito do soft-delete.
 */
export type UserStatus = 'active' | 'suspended';

/**
 * Usuario (pessoa) que acessa o Dashboard, dentro de um tenant — Milestone 5,
 * Bloco M5A (espelha o model `User` em `prisma/schema.prisma`).
 *
 * `passwordHash` e SEMPRE o hash, nunca a senha em texto plano (mesmo
 * principio de `Tenant.apiKeyHash`) — o algoritmo de hash (Argon2/bcrypt) e
 * escopo do M5B; esta entidade so carrega o resultado. `email` e unico POR
 * TENANT (ver `@@unique([tenantId, email])` no schema), nunca global.
 *
 * Papel UNICO por usuario (D56): um `role`, nao uma lista. `lastLoginAt` e
 * opcional (nunca logou ainda).
 */
export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt?: Date;
  /**
   * Senha PROVISORIA: `true` quando a senha atual foi definida por um
   * administrador (convite ou reset) e ainda nao foi trocada pelo proprio dono
   * da conta — Milestone 5, Bloco M5E (D64). Enquanto `true`, o login funciona
   * mas o Dashboard obriga a troca antes de liberar o resto do sistema.
   *
   * OPCIONAL (nao `boolean` obrigatorio) de proposito: ausente equivale a
   * `false`. Isso mantem compativel todo codigo/fixture anterior ao M5E, que
   * monta `User` sem esse campo — mesma disciplina aditiva de `lastLoginAt` e
   * de `Conversation.assignedToUserId`.
   */
  mustChangePassword?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Usuario "publico": tudo do `User` MENOS o `passwordHash`. E o formato que
 * sai da API/`/me` — a senha (mesmo hasheada) NUNCA trafega para fora do
 * backend. Milestone 5, Bloco M5C.
 */
export type PublicUser = Omit<User, 'passwordHash'>;

/**
 * Converte `User` -> `PublicUser` removendo EXPLICITAMENTE o `passwordHash`.
 * Extraido do AuthService no M5E (o UserManagementService passou a ser o
 * segundo consumidor — DRY): a regra "senha nunca sai do backend" vive num
 * lugar so, junto da entidade que ela protege.
 */
export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}
