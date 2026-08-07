import {
  DateRange,
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  SessionStabilityPoint,
  PipelineFunnelCounts,
  EscalationRatePoint,
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
 *
 * Milestone 6, Bloco M6H-4 (2026-07-26) — TODOS os metodos ganharam
 * `sessionName` como segundo parametro obrigatorio (apos `tenantId`): cada
 * WhatsApp e um "negocio" independente na nova navegacao por sessao
 * (M6H-1), entao as metricas precisam ser calculadas por sessao, nao mais
 * agregadas para o tenant inteiro. SEM migration: `whatsapp_conversations`/
 * `whatsapp_session_events` ja tem `session_name` indexado (filtro direto);
 * `ai_interactions`/`whatsapp_messages` NAO tem `session_name` proprio —
 * `PrismaAnalyticsRepository` resolve isso com JOIN em
 * `whatsapp_conversations` (via `conversation_id`), decisao explicita do
 * fundador (join, nao coluna denormalizada) para nao adicionar mais uma
 * migration a este bloco.
 */
export interface AnalyticsRepository {
  /** Uso de IA por dia (interacoes, status, tokens, custo, latencia media), escopado a UMA sessao. */
  aiUsageByPeriod(tenantId: string, sessionName: string, range: DateRange): Promise<AiUsagePoint[]>;

  /** Fluxo de mensagens inbound/outbound por dia, escopado a UMA sessao. */
  messageFlowByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<MessageFlowPoint[]>;

  /** Novas conversas por dia, escopado a UMA sessao. */
  newConversationsByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<NewConversationsPoint[]>;

  /** Contagem atual de conversas por status (retrato, sem faixa de tempo), escopado a UMA sessao. */
  conversationStatusCounts(
    tenantId: string,
    sessionName: string,
  ): Promise<ConversationStatusCounts>;

  /** Estabilidade de sessao por dia (metrica opcional, D42), escopado a UMA sessao. */
  sessionStabilityByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<SessionStabilityPoint[]>;

  /**
   * Fase 1, Bloco F1.6 (Analytics de NEGOCIO) — contagem atual de conversas
   * por estagio do Pipeline (retrato, sem faixa de tempo, mesmo racional de
   * `conversationStatusCounts`), escopado a UMA sessao. Reaproveita o indice
   * `@@index([tenantId, sessionName, stage])` ja existente desde a M6H-5
   * (Kanban) — sem migration.
   */
  pipelineFunnelCounts(tenantId: string, sessionName: string): Promise<PipelineFunnelCounts>;

  /**
   * Fase 1, Bloco F1.6 — taxa de escalonamento por dia (das conversas
   * CRIADAS naquele dia, quantas em algum momento tiveram `escalatedAt`
   * preenchido), escopado a UMA sessao.
   */
  escalationRateByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<EscalationRatePoint[]>;
}
