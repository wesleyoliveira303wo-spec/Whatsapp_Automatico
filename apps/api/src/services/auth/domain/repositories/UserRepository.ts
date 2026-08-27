import { User, UserRole, UserStatus } from '../entities/User';

/** Campos para criar um usuario — `id`/`createdAt`/`updatedAt` sao gerados pela persistencia (mesmo padrao de `AiInteractionRepository.record`). */
export type NewUser = Omit<User, 'id' | 'createdAt' | 'updatedAt'>;

/** Alteracoes permitidas em um usuario existente — so os campos que o ciclo de vida de auth muta. Nunca `tenantId`/`email` (identidade fixa). */
export interface UserUpdate {
  passwordHash?: string;
  role?: UserRole;
  status?: UserStatus;
  lastLoginAt?: Date;
  /** Liga/desliga a exigencia de troca de senha (M5E): ligada por um reset de admin, desligada quando o proprio dono troca. */
  mustChangePassword?: boolean;
  /** Reorganizacao Perfil/Configuracoes (2026-08-27) — o proprio usuario edita seu nome/foto em `PATCH /auth/me`. */
  name?: string;
  avatarUrl?: string;
}

/**
 * Filtros/paginacao da listagem de usuarios de um tenant — Milestone 5, Bloco
 * M5E. Paginacao por CURSOR (nao offset), mesmo contrato de
 * `ListAuditLogsOptions`/`ListConversationsOptions`: estavel mesmo com
 * insercoes concorrentes.
 */
export interface ListUsersOptions {
  limit: number;
  cursor?: string;
  status?: UserStatus;
  role?: UserRole;
}

/** Uma pagina de usuarios. `nextCursor` ausente = nao ha mais paginas. */
export interface UserPage {
  users: User[];
  nextCursor?: string;
}

/**
 * Porta (port) de persistencia de `User` — Milestone 5, Bloco M5A. Bounded
 * context `services/auth` (D63), read/write. Nenhuma regra de negocio aqui —
 * so contrato de leitura/escrita; validacao de tenant/permissao vive na
 * Application (M5C/M5D), mesmo padrao dos demais repositorios do projeto.
 *
 * Deliberadamente enxuto no M5A (create + os reads que o login precisa +
 * update): `listByTenant`/`countByTenant` serao adicionados de forma aditiva
 * quando seus consumidores aparecerem (CRUD no M5E, bootstrap no M5C) — mesma
 * disciplina de crescimento incremental de port ja usada em
 * `ConversationRepository` ao longo dos Blocos 2/4/5.
 */
export interface UserRepository {
  create(input: NewUser): Promise<User>;

  findById(id: string): Promise<User | null>;

  /** Localiza o usuario pelo par (tenant, email) — usado no login legado com tenantId explicito. `email` e unico GLOBAL desde 2026-08-26, mas o par continua funcionando (tenantId vira so um filtro redundante). */
  findByTenantAndEmail(tenantId: string, email: string): Promise<User | null>;

  /**
   * Localiza o usuario pelo e-mail, SEM exigir o tenant — Fase Auth/Registro
   * (2026-08-26). E o que viabiliza o login com so e-mail+senha: o tenant e
   * resolvido a partir do proprio usuario encontrado. So existe porque
   * `email` e unico GLOBAL agora.
   */
  findByEmail(email: string): Promise<User | null>;

  /** Verifica se ja existe algum usuario com este e-mail — usado no registro (Fase Auth/Registro) para responder 409 sem vazar mais detalhe. */
  existsByEmail(email: string): Promise<boolean>;

  /**
   * Lista os usuarios de UM tenant (isolamento multi-tenant no proprio
   * contrato: nao existe "listar todos"), do mais recente para o mais antigo.
   * Adicionado no M5E, quando o CRUD passou a ser seu consumidor — exatamente
   * o crescimento aditivo previsto no M5A.
   */
  listByTenant(tenantId: string, options: ListUsersOptions): Promise<UserPage>;

  /**
   * Atualiza campos mutaveis de um usuario existente. Devolve o usuario
   * atualizado, ou `undefined` se o id nao existir (mesmo padrao de
   * `ConversationRepository.updateStatus` — quem chama decide se e 404).
   */
  update(id: string, changes: UserUpdate): Promise<User | undefined>;
}
