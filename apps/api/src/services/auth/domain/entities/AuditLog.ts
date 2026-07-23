/**
 * Registro imutavel de um evento relevante, atribuido a um ator — Milestone 5,
 * Bloco M5A (o "livro da portaria"; espelha o model `AuditLog` no schema).
 * Append-only: nunca atualizado/apagado (mesmo padrao de
 * `AiInteraction`/`WhatsAppSessionEvent`).
 *
 * `actorUserId` e opcional: uma acao pode ser do sistema/maquina (sem usuario)
 * — e, mesmo quando ha ator, e uma referencia por id SEM FK (o registro
 * sobrevive a exclusao do usuario COM o id preservado; ver docstring do model
 * no schema). `action` e uma string de catalogo (ex.: `auth.login.success`)
 * cujos valores sao definidos pelos produtores dos eventos (M5C/M5D), nao um
 * enum fechado aqui. `metadata` guarda detalhes livres do evento sem exigir
 * uma coluna por tipo.
 */
export interface AuditLog {
  id: string;
  tenantId: string;
  actorUserId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  occurredAt: Date;
}
