import { AiBusinessProfile } from '../entities/AiBusinessProfile';

/**
 * Porta (port) de persistência do perfil de negócio de um tenant — Base de
 * Conhecimento (Nível 1). Contrato mínimo: ler o perfil (para injetar no
 * prompt e para a UI exibir) e gravá-lo (upsert — o dono do negócio salva o
 * texto uma vez e edita depois; há no máximo um perfil por tenant, então não
 * há "criar vs. atualizar" separados a expor).
 *
 * Sem `delete`: "apagar o cérebro" é o mesmo que salvar um texto vazio (a IA
 * volta ao comportamento genérico) — não há caso de uso para remover a linha
 * inteira, então não expomos a operação (YAGNI).
 */
export interface AiBusinessProfileRepository {
  /** Devolve o perfil do tenant, ou `null` se ele nunca foi configurado. */
  findByTenant(tenantId: string): Promise<AiBusinessProfile | null>;

  /**
   * Cria ou atualiza o perfil do tenant com o `content` informado, devolvendo
   * o estado persistido (com `updatedAt` novo). Idempotente por `tenantId`.
   */
  upsert(tenantId: string, content: string): Promise<AiBusinessProfile>;
}
