import { AnalyticsRepository } from '../../../src/services/analytics/domain/repositories/AnalyticsRepository';
import {
  DateRange,
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  SessionStabilityPoint,
} from '../../../src/services/analytics/domain/AnalyticsMetrics';

/**
 * Fake em memoria do `AnalyticsRepository` (Milestone 4, Bloco M4B) — sem
 * Prisma/Postgres. Captura os argumentos da ultima chamada de cada metodo (para
 * asserts de delegacao) e devolve valores configuraveis por `seed*`. Mesmo
 * espirito dos demais Fakes deste pacote (`FakeConversationRepository` etc.).
 */
export class FakeAnalyticsRepository implements AnalyticsRepository {
  public aiUsageCalls: Array<{ tenantId: string; range: DateRange }> = [];
  public messageFlowCalls: Array<{ tenantId: string; range: DateRange }> = [];
  public newConversationsCalls: Array<{ tenantId: string; range: DateRange }> = [];
  public conversationStatusCountsCalls: string[] = [];
  public sessionStabilityCalls: Array<{ tenantId: string; range: DateRange }> = [];

  private aiUsageResult: AiUsagePoint[] = [];
  private messageFlowResult: MessageFlowPoint[] = [];
  private newConversationsResult: NewConversationsPoint[] = [];
  private conversationStatusCountsResult: ConversationStatusCounts = { bot: 0, human: 0 };
  private sessionStabilityResult: SessionStabilityPoint[] = [];

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

  async aiUsageByPeriod(tenantId: string, range: DateRange): Promise<AiUsagePoint[]> {
    this.aiUsageCalls.push({ tenantId, range });
    return this.aiUsageResult;
  }
  async messageFlowByPeriod(tenantId: string, range: DateRange): Promise<MessageFlowPoint[]> {
    this.messageFlowCalls.push({ tenantId, range });
    return this.messageFlowResult;
  }
  async newConversationsByPeriod(tenantId: string, range: DateRange): Promise<NewConversationsPoint[]> {
    this.newConversationsCalls.push({ tenantId, range });
    return this.newConversationsResult;
  }
  async conversationStatusCounts(tenantId: string): Promise<ConversationStatusCounts> {
    this.conversationStatusCountsCalls.push(tenantId);
    return this.conversationStatusCountsResult;
  }
  async sessionStabilityByPeriod(tenantId: string, range: DateRange): Promise<SessionStabilityPoint[]> {
    this.sessionStabilityCalls.push({ tenantId, range });
    return this.sessionStabilityResult;
  }
}
