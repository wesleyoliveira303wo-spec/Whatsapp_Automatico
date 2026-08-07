import { Logger } from '../../../shared/domain/Logger';
import { TenantRepository } from '../../../shared/tenant/domain/TenantRepository';
import { TenantNotFoundError } from '../../../shared/tenant/domain/errors/TenantNotFoundError';
import { AnalyticsRepository } from '../domain/repositories/AnalyticsRepository';
import { InvalidAnalyticsRangeError } from '../domain/errors/InvalidAnalyticsRangeError';
import {
  DateRange,
  AiUsagePoint,
  MessageFlowPoint,
  NewConversationsPoint,
  ConversationStatusCounts,
  SessionStabilityPoint,
  PipelineFunnelCounts,
  EscalationRatePoint,
} from '../domain/AnalyticsMetrics';

/**
 * Teto de janela de uma consulta de serie temporal (Milestone 4, Bloco M4B —
 * D48). 366 dias (um ano bissexto) — mesmo espirito de `MAX_LIST_LIMIT`
 * (Bloco 5): nenhuma consulta sem limite (`CLAUDE.md` par.15, "seguranca
 * primeiro"). Uma janela maior tornaria uma unica requisicao arbitrariamente
 * cara; quem precisar de mais faz varias chamadas.
 */
export const MAX_WINDOW_DAYS = 366;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Application Service de Analytics (Milestone 4, Bloco M4B — ADR #59). Mesmo
 * papel de `ConversationsService`/`AiInteractionsService` (Bloco 5): valida a
 * existencia do tenant ANTES de delegar ao repositorio, para que a Presentation
 * (M4C) nunca precise conhecer `TenantRepository` diretamente (roteador fino,
 * sem Controller — padrao D18).
 *
 * Read-only por construcao (D51): so ORQUESTRA leituras (valida tenant, valida
 * faixa, delega). Nenhum efeito colateral, nenhuma escrita, nenhum cache. Em
 * qualquer conflito futuro de performance, a resposta e indice/consulta melhor
 * (M4A/M4C), nunca pre-agregacao aqui.
 *
 * Milestone 6, Bloco M6H-4 (2026-07-26): todo metodo publico ganhou
 * `sessionName` — mesmo padrao de `AiBusinessProfileService` (M6H-3). NAO
 * valida que a sessao existe em `services/whatsapp` (baixo acoplamento entre
 * bounded contexts, mesmo principio ja seguido no projeto): uma sessao
 * inexistente so devolve series/contagens vazias, nunca um erro — e um
 * resultado inerte, nao um estado prejudicial.
 */
export class AnalyticsService {
  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly logger: Logger,
  ) {}

  /** Uso de IA por dia, escopado a uma sessao. */
  async getAiUsage(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<AiUsagePoint[]> {
    await this.assertTenantExists(tenantId);
    this.assertValidRange(range);
    return this.analyticsRepository.aiUsageByPeriod(tenantId, sessionName, range);
  }

  /** Fluxo de mensagens inbound/outbound por dia, escopado a uma sessao. */
  async getMessageFlow(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<MessageFlowPoint[]> {
    await this.assertTenantExists(tenantId);
    this.assertValidRange(range);
    return this.analyticsRepository.messageFlowByPeriod(tenantId, sessionName, range);
  }

  /** Novas conversas por dia, escopado a uma sessao. */
  async getNewConversations(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<NewConversationsPoint[]> {
    await this.assertTenantExists(tenantId);
    this.assertValidRange(range);
    return this.analyticsRepository.newConversationsByPeriod(tenantId, sessionName, range);
  }

  /** Contagem atual de conversas por status (sem faixa de tempo — D42), escopado a uma sessao. */
  async getConversationStatusCounts(
    tenantId: string,
    sessionName: string,
  ): Promise<ConversationStatusCounts> {
    await this.assertTenantExists(tenantId);
    return this.analyticsRepository.conversationStatusCounts(tenantId, sessionName);
  }

  /** Estabilidade de sessao por dia (metrica opcional, D42), escopado a uma sessao. */
  async getSessionStability(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<SessionStabilityPoint[]> {
    await this.assertTenantExists(tenantId);
    this.assertValidRange(range);
    return this.analyticsRepository.sessionStabilityByPeriod(tenantId, sessionName, range);
  }

  /** Fase 1, Bloco F1.6 — contagem atual de conversas por estagio do Pipeline (sem faixa de tempo), escopado a uma sessao. */
  async getPipelineFunnel(tenantId: string, sessionName: string): Promise<PipelineFunnelCounts> {
    await this.assertTenantExists(tenantId);
    return this.analyticsRepository.pipelineFunnelCounts(tenantId, sessionName);
  }

  /** Fase 1, Bloco F1.6 — taxa de escalonamento por dia, escopado a uma sessao. */
  async getEscalationRate(
    tenantId: string,
    sessionName: string,
    range: DateRange,
  ): Promise<EscalationRatePoint[]> {
    await this.assertTenantExists(tenantId);
    this.assertValidRange(range);
    return this.analyticsRepository.escalationRateByPeriod(tenantId, sessionName, range);
  }

  private async assertTenantExists(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepository.findById(tenantId);
    if (!tenant) {
      this.logger.warn('Consulta de analytics recusada: tenant inexistente', { tenantId });
      throw new TenantNotFoundError(tenantId);
    }
  }

  /**
   * Valida a faixa de tempo: `from` nao pode ser depois de `to`, e a janela nao
   * pode exceder `MAX_WINDOW_DAYS`. Lanca `InvalidAnalyticsRangeError` (mapeado
   * para 400 na Presentation, M4C). Inclusiva no limite: uma janela de exatamente
   * `MAX_WINDOW_DAYS` e valida.
   */
  private assertValidRange(range: DateRange): void {
    const fromMs = range.from.getTime();
    const toMs = range.to.getTime();

    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
      throw new InvalidAnalyticsRangeError(
        'Faixa de datas invalida (from/to nao sao datas validas).',
      );
    }
    if (fromMs > toMs) {
      throw new InvalidAnalyticsRangeError('Faixa de datas invalida: from e posterior a to.');
    }
    const windowDays = (toMs - fromMs) / MS_PER_DAY;
    if (windowDays > MAX_WINDOW_DAYS) {
      throw new InvalidAnalyticsRangeError(
        `Janela de tempo excede o maximo de ${MAX_WINDOW_DAYS} dias.`,
      );
    }
  }
}
