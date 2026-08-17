/** O que a IA precisa saber sobre a origem de campanha de uma conversa — só o texto que NÓS enviamos primeiro. */
export interface CampaignOriginInfo {
  messageSent: string;
}

/**
 * Porta (port) para descobrir se uma conversa nasceu de uma campanha de
 * disparo — Fase L, Bloco L6 (`FASE_L_MOTOR_DE_LEADS.md` §9.6). Mesmo papel
 * estrutural de `AiBusinessProfileRepository`: declarada no lado CONSUMIDOR
 * (`services/ai`), implementada no lado dono da capacidade
 * (`services/campaigns/infrastructure`).
 *
 * Existe para corrigir uma premissa do `PromptVersion` `v2`: ele pressupõe
 * que toda conversa foi iniciada PELO CLIENTE. Numa conversa de campanha,
 * foi a empresa que procurou o lead primeiro — sem este contexto, a IA
 * poderia perguntar "em que posso ajudar?" para alguém que não pediu nada,
 * uma quebra de contexto perceptível.
 */
export interface CampaignOriginResolver {
  /** `undefined` = conversa não nasceu de campanha (o caso comum). NUNCA lança. */
  findOrigin(tenantId: string, conversationId: string): Promise<CampaignOriginInfo | undefined>;
}
