/**
 * Porta (port) para marcar que um lead RESPONDEU a uma conversa de campanha —
 * Fase L, Bloco L6 (`FASE_L_MOTOR_DE_LEADS.md` §9.4/§13: "marca `REPLIED` —
 * primeira inbound na conversa de campanha"). Mesmo papel estrutural de
 * `ContactResolver`/`OptOutDetector`: declarada no lado CONSUMIDOR
 * (`conversations`), implementada no lado dono da capacidade
 * (`services/campaigns/infrastructure`).
 *
 * `REPLIED` é o que torna a métrica de taxa de resposta de campanha possível
 * sem nenhuma agregação cara (ver docstring de `CampaignRecipient` no
 * `schema.prisma`).
 *
 * NUNCA lança — auxiliar, mesmo padrão de `OptOutDetector.detectAndRecord`:
 * uma falha ao marcar a resposta jamais pode impedir a ingestão da mensagem
 * em si.
 */
export interface CampaignReplyTracker {
  /**
   * Se `conversationId` tem algum `CampaignRecipient` ainda `SENT` (nunca
   * respondido), marca `REPLIED` + `repliedAt = agora`. No-op silencioso se
   * a conversa nunca teve origem em campanha, ou se já foi marcada
   * (idempotente — chamadas seguintes na mesma conversa não fazem nada).
   */
  markRepliedIfCampaignOrigin(tenantId: string, conversationId: string): Promise<void>;
}
