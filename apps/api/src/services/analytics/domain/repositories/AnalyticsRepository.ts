import {
  DateRange,
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  SessionStabilityPoint,
} from '../AnalyticsMetrics';

/**
 * Porta (port) de leitura agregada de metricas — Milestone 4, Bloco M4B
 * (ADR #59). Bounded context `services/analytics`, EXCLUSIVAMENTE read-only
 * (D51): toda implementacao (M4C, `PrismaAnalyticsRepository`) deriva as
 * metricas por consulta direta as tabelas existentes no momento da requisicao.
 * PROIBIDO por D51 em qualquer implementacao deste port: cache, rollup,
 * tabela de agregacao, materialized view, job, scheduler, BullMQ, Redis.
 *
 * `tenantId` explicito e SEMPRE o primeiro filtro de toda consulta (defesa em
 * profundidade — mesmo racional de `listByConversation`/`listRecentByConversation`
 * dos Blocos 4/5): nenhuma agregacao cruza a fronteira de um tenant.
 *
 * Este port NAO depende de, nem altera, os repositorios dos outros bounded
 * contexts (`AiInteractionRepository`, `MessageRepository`, `ConversationRepository`
 * permanecem INTOCADOS — D47): agregacao read-only e uma preocupacao propria
 * do contexto de analytics, que le as tabelas fisicas por SQL de leitura sem
 * importar as entidades ricas nem os ports dos outros contextos.
 *
 * Buckets temporais sao DIARIOS em UTC (D45) — `granularity` so admite `day`
 * no MVP, validado na Presentation (M4C), por isso nao aparece neste port.
 */
export interface AnalyticsRepository {
  /** Uso de IA por dia (interacoes, status, tokens, custo, latencia media). */
  aiUsageByPeriod(tenantId: string, range: DateRange): Promise<AiUsagePoint[]>;

  /** Fluxo de mensagens inbound/outbound por dia. */
  messageFlowByPeriod(tenantId: string, range: DateRange): Promise<MessageFlowPoint[]>;

  /** Novas conversas por dia. */
  newConversationsByPeriod(tenantId: string, range: DateRange): Promise<NewConversationsPoint[]>;

  /** Contagem atual de conversas por status (retrato, sem faixa de tempo). */
  conversationStatusCounts(tenantId: string): Promise<ConversationStatusCounts>;

  /** Estabilidade de sessao por dia (metrica opcional, D42). */
  sessionStabilityByPeriod(tenantId: string, range: DateRange): Promise<SessionStabilityPoint[]>;
}
