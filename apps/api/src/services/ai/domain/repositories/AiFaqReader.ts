/** O que a IA precisa saber de UMA FAQ para respondê-la — nunca o `id`/`tenantId`/`createdAt` etc. */
export interface AiFaqEntryInfo {
  question: string;
  answer: string;
  category: string | null;
}

/**
 * Porta (port) para ler as FAQs ATIVAS de uma sessão — Cérebro da IA v3,
 * Fase 2 (2026-08-25). Mesmo papel estrutural de `AiBusinessProfileRepository`/
 * `CampaignOriginResolver`: declarada no lado CONSUMIDOR (`services/ai`),
 * implementada no lado dono da capacidade (`services/aiFaq/infrastructure`).
 */
export interface AiFaqReader {
  /** Lista vazia = sem FAQ cadastrada (ou nenhuma ativa) para a sessão. NUNCA lança. */
  listActiveFaqEntries(tenantId: string, sessionName: string): Promise<AiFaqEntryInfo[]>;
}
