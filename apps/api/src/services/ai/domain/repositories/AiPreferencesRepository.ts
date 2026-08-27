import { AiAutonomyLevel, AiPreferences } from '../entities/AiPreferences';

/** Dados a gravar/atualizar — todos opcionais (upsert parcial, mesmo padrão de `AiProfileSaveData`). */
export interface AiPreferencesSaveData {
  autonomyLevel?: AiAutonomyLevel;
  maxDiscountPercent?: number | null;
  topicsToAvoid?: string | null;
  escalateAfterAttempts?: number | null;
  customHandoffMessage?: string | null;
}

/**
 * Porta (port) de persistência das Preferências da IA — Cérebro da IA v3,
 * Fase 3. Mesmo contrato mínimo de `AiBusinessProfileRepository`: ler (para
 * a UI e para `ConversationAiService`/`AiReplyJobProcessor` injetarem no
 * prompt/handoff) e gravar (upsert — no máximo uma linha por sessão).
 *
 * Sem `delete`: "resetar as preferências" é o mesmo que salvar todos os
 * campos de volta ao default — não há caso de uso para remover a linha
 * inteira (YAGNI, mesmo racional de `AiBusinessProfileRepository`).
 */
export interface AiPreferencesRepository {
  /** Devolve as preferências da sessão, ou `null` se ela nunca configurou nenhuma (a IA usa os defaults do prompt base). */
  findByTenantAndSession(tenantId: string, sessionName: string): Promise<AiPreferences | null>;

  /** Cria ou atualiza as preferências de `(tenantId, sessionName)`. Campos não informados preservam o valor já gravado (ou o default do schema, na criação). */
  upsert(
    tenantId: string,
    sessionName: string,
    data: AiPreferencesSaveData,
  ): Promise<AiPreferences>;
}
