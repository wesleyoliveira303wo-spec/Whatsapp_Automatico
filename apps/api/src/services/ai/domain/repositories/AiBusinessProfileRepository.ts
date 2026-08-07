import { AiBusinessProfile } from '../entities/AiBusinessProfile';

/**
 * Dados a gravar/atualizar no perfil (F1.8: inclui campos de horário de
 * atendimento além do `content`). Todos os campos novos são opcionais com
 * defaults definidos na migration — `content` é obrigatório pois existia antes.
 */
export interface AiProfileSaveData {
  content: string;
  offHoursEnabled?: boolean;
  offHoursMessage?: string | null;
  workingHoursStart?: string | null;
  workingHoursEnd?: string | null;
  workingDays?: number;
  timezone?: string;
}

/**
 * Porta (port) de persistência do perfil de negócio de uma sessão — Base de
 * Conhecimento (Nível 1). Contrato mínimo: ler o perfil (para injetar no
 * prompt e para a UI exibir) e gravá-lo (upsert — o dono do negócio salva o
 * texto uma vez e edita depois; há no máximo um perfil por `(tenantId,
 * sessionName)`, então não há "criar vs. atualizar" separados a expor).
 *
 * Migrado de 1:1 por TENANT para 1:1 por (TENANT, SESSÃO) — Milestone 6,
 * Bloco M6H-3, 2026-07-25 (ver docstring de `AiBusinessProfile`).
 *
 * Sem `delete`: "apagar o cérebro" é o mesmo que salvar um texto vazio (a IA
 * volta ao comportamento genérico) — não há caso de uso para remover a linha
 * inteira, então não expomos a operação (YAGNI).
 */
export interface AiBusinessProfileRepository {
  /** Devolve o perfil da sessão, ou `null` se ela nunca foi configurada. */
  findByTenantAndSession(tenantId: string, sessionName: string): Promise<AiBusinessProfile | null>;

  /**
   * Cria ou atualiza o perfil de `(tenantId, sessionName)` com os dados
   * informados, devolvendo o estado persistido (com `updatedAt` novo).
   * Idempotente por `(tenantId, sessionName)`.
   */
  upsert(
    tenantId: string,
    sessionName: string,
    data: AiProfileSaveData,
  ): Promise<AiBusinessProfile>;
}
