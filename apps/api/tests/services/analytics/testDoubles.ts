import { AnalyticsRepository } from '../../../src/services/analytics/domain/repositories/AnalyticsRepository';
import {
  DateRange,
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  SessionStabilityPoint,
  PipelineFunnelCounts,
  EscalationRatePoint,
} from '../../../src/services/analytics/domain/AnalyticsMetrics';

/**
 * Fake em memoria do `AnalyticsRepository` (Milestone 4, Bloco M4B) — sem
 * Prisma/Postgres. Captura os argumentos da ultima chamada de cada metodo (para
 * asserts de delegacao) e devolve valores configuraveis por `seed*`. Mesmo
 * espirito dos demais Fakes deste pacote (`FakeConversationRepository` etc.).
 *
 * Milestone 6, Bloco M6H-4 (2026-07-26): todo metodo/registro de chamada
 * ganhou `sessionName`.
 */
export class FakeAnalyticsRepository implements AnalyticsRepository {
  public aiUsageCalls: Array<{ tenantId: string; sessionName: string; range: DateRange }> = [];
  public messageFlowCalls: Array<{ tenantId: string; sessionName: string; range: DateRange }> = [];
  public newConversationsCalls: Array<{ tenantId: string; sessionName: string; range: DateRange }> =
    [];
  public conversationStatusCountsCalls: Array<{ tenantId: string; sessionName: string }> = [];
  public sessionStabilityCalls: Array<{ tenantId: string; sessionName: string; range: DateRange }> =
    [];
  public pipelineFunnelCalls: Array<{ tenantId: string; sessionName: string }> = [];
  public escalationRateCalls: Array<{ tenantId: string; sessionName: string; range: DateRange }> =
    [];

  private aiUsageResult: AiUsagePoint[] = [];
  private messageFlowResult: MessageFlowPoint[] = [];
  private newConversationsResult: NewConversationsPoint[] = [];
  private conversationStatusCountsResult: ConversationStatusCounts = { bot: 0, human: 0 };
  private sessionStabilityResult: SessionStabilityPoint[] = [];
  private pipelineFunnelResult: PipelineFunnelCounts = {
    new: 0,
    contacted: 0,
    negotiating: 0,
    closed_won: 0,
    closed_lost: 0,
  };
  private escalationRateResult: EscalationRatePoint[] = [];

  seedAiUsage(points: AiUsagePoint[]): void {
    this.aiUsageResult = points;
  }
  seedMessageFlow(points: MessageFlowPoint[]): void {
    this.messageFlowResult = points;
  }
  seedNewConversations(points: NewConversationsPoint[]): void {
    this.newConversationsResult = points;
  }
  seedConversationStatusCounts(counts: ConversationStatusCounts): void {
    this.conversationStatusCountsResult = counts;
  }
  seedSessionStability(points: SessionStabilityPoint[]): void {
    this.sessionStabilityResult = points;
  }
  seedPipelineFunnel(counts: PipelineFunnelCounts): void {
    this.pipelineFunnelResult = counts;
  }
  seedEscalationRate(points: EscalationRatePoint[]): void {
    this.escalationRateResult = points;
  }

  async aiUsageByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<AiUsagePoint[]> {
    this.aiUsageCalls.push({ tenantId, sessionName, range });
    return this.aiUsageResult;
  }
  async messageFlowByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<MessageFlowPoint[]> {
    this.messageFlowCalls.push({ tenantId, sessionName, range });
    return this.messageFlowResult;
  }
  async newConversationsByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<NewConversationsPoint[]> {
    this.newConversationsCalls.push({ tenantId, sessionName, range });
    return this.newConversationsResult;
  }
  async conversationStatusCounts(
    tenantId: string,
    sessionName: string,
  ): Promise<ConversationStatusCounts> {
    this.conversationStatusCountsCalls.push({ tenantId, sessionName });
    return this.conversationStatusCountsResult;
  }
  async sessionStabilityByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<SessionStabilityPoint[]> {
    this.sessionStabilityCalls.push({ tenantId, sessionName, range });
    return this.sessionStabilityResult;
  }
  async pipelineFunnelCounts(tenantId: string, sessionName: string): Promise<PipelineFunnelCounts> {
    this.pipelineFunnelCalls.push({ tenantId, sessionName });
    return this.pipelineFunnelResult;
  }
  async escalationRateByPeriod(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<EscalationRatePoint[]> {
    this.escalationRateCalls.push({ tenantId, sessionName, range });
    return this.escalationRateResult;
  }
}
