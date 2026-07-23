/**
 * DTOs de metricas de Analytics (Milestone 4, Bloco M4B — ADR #59).
 *
 * Tipos de DADOS puros (sem comportamento) devolvidos pelo `AnalyticsRepository`
 * e repassados pelo `AnalyticsService` a Presentation. Analytics e um bounded
 * context EXCLUSIVAMENTE read-only (D51): estes tipos representam resultados de
 * agregacao derivados das tabelas existentes no momento da consulta — nunca uma
 * entidade de negocio persistida, nunca um rollup/cache.
 */

/**
 * Faixa de tempo fechada de uma consulta de serie temporal. `Date` (nao string)
 * — o parse de ISO da query string acontece na Presentation (M4C, Zod); o
 * Domain/Application trabalha com `Date` ja validada. Buckets sao diarios em
 * UTC (D45) — ver docstrings do `AnalyticsRepository`.
 */
export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Ponto diario de uso de IA (derivado de `AiInteraction`). `date` no formato
 * ISO `YYYY-MM-DD`, bucket em UTC (D45). `costUsd` e STRING decimal exata,
 * nunca `number` (D46 / restricao herdada do Bloco 3b: arredondamento de float
 * e inaceitavel para dinheiro) — a conversao para numero so acontece na
 * fronteira de renderizacao do grafico (M4E), nunca no transporte.
 */
export interface AiUsagePoint {
  date: string;
  interactions: number;
  successCount: number;
  validationRejectedCount: number;
  providerErrorCount: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: string;
  avgLatencyMs: number;
}

/** Ponto diario de fluxo de mensagens (derivado de `WhatsAppMessage.direction`). */
export interface MessageFlowPoint {
  date: string;
  inbound: number;
  outbound: number;
}

/** Ponto diario de novas conversas (derivado de `WhatsAppConversation.createdAt`). */
export interface NewConversationsPoint {
  date: string;
  count: number;
}

/**
 * Contagem ATUAL de conversas por status (derivado de
 * `WhatsAppConversation.status`). Nao e serie temporal — e um retrato do
 * estado corrente (D42: "contagem atual por status"), por isso nao recebe
 * `DateRange`.
 */
export interface ConversationStatusCounts {
  bot: number;
  human: number;
}

/**
 * Ponto diario de estabilidade de sessao (derivado de `WhatsAppSessionEvent`).
 * Metrica OPCIONAL da milestone (D42) — incluida no contrato para o port ficar
 * completo; seu consumo em Presentation/UI e decidido em M4C/M4E.
 */
export interface SessionStabilityPoint {
  date: string;
  connected: number;
  disconnected: number;
  connecting: number;
}
