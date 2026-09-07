import { PlatformUser } from '../entities/PlatformUser';

/** Porta de persistência do dono da plataforma (Fase 1 do `/admin`). */
export interface PlatformUserRepository {
  /**
   * Busca por e-mail para o login. `email` é comparado já normalizado
   * (minúsculo, sem espaços) — quem normaliza é o Application Service, para a
   * regra viver num lugar só.
   */
  findByEmail(email: string): Promise<PlatformUser | null>;

  findById(id: string): Promise<PlatformUser | null>;

  /** Registra o último acesso. Falha aqui nunca impede o login (ver o Service). */
  touchLastLogin(id: string, at: Date): Promise<void>;

  /**
   * Cria o admin. Sem rota HTTP: o primeiro (e por ora único) nasce por
   * script, mesmo caminho de `deleteTenant`/`backfillContacts`
   * (`ADMIN_PLATFORM_MASTER_PLAN.md`, anexo).
   */
  create(user: Omit<PlatformUser, 'id' | 'createdAt' | 'lastLoginAt'>): Promise<PlatformUser>;
}
