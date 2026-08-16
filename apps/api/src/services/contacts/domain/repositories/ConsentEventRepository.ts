import { ConsentEvent, ConsentEventType } from '../entities/Contact';

/** Dados de um novo evento de consentimento. `id`/`occurredAt` são do repositório. */
export interface RecordConsentEventData {
  tenantId: string;
  contactId: string;
  type: ConsentEventType;
  reason?: string;
  actorUserId?: string;
}

/**
 * Porta (port) do log de consentimento — Fase L, Bloco L2. Separado de
 * `ContactRepository` pelo mesmo motivo de `AuditLogRepository` viver
 * separado dos demais repositórios deste projeto: é um log APPEND-ONLY
 * (só escreve), com ciclo de vida e garantias diferentes de uma entidade
 * mutável como `Contact` — nunca update, nunca delete.
 *
 * Só `record` nesta rodada (L2 não tem tela de histórico de consentimento) —
 * mesma disciplina de YAGNI já aplicada a `AiInteractionRepository`.
 */
export interface ConsentEventRepository {
  record(data: RecordConsentEventData): Promise<ConsentEvent>;
}
