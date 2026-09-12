/**
 * Um grupo disponível para publicação, no vocabulário deste bounded context —
 * subconjunto deliberado de `WhatsAppGroupSummary` (`services/whatsapp`): só o
 * que a regra de supressão e a gravação do alvo precisam.
 */
export interface GroupDirectoryEntry {
  jid: string;
  name: string;
  participantCount: number;
  /** `false` num grupo "só administradores enviam" onde o número não é admin. */
  canSend: boolean;
}

/**
 * Porta (port) para CONSULTAR os grupos de uma sessão — Disparos em grupos
 * (2026-09-11). Declarada no lado CONSUMIDOR (mesmo padrão de
 * `CampaignMessageSender`/`ContactResolver`), implementada em
 * `services/whatsapp/infrastructure` (único lugar com o socket).
 *
 * Usada na CRIAÇÃO do disparo para o servidor conferir, por conta própria, se
 * cada grupo pedido existe e aceita envio — nunca confiando no que o cliente
 * diz. Lança `GroupDirectoryUnavailableError` quando não dá para perguntar
 * (sessão desconectada, WhatsApp sem resposta).
 */
export interface GroupDirectory {
  listGroups(tenantId: string, sessionName: string): Promise<GroupDirectoryEntry[]>;
}
