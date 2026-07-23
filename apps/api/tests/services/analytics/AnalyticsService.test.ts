import { AnalyticsService, MAX_WINDOW_DAYS } from '../../../src/services/analytics/application/AnalyticsService';
import { InvalidAnalyticsRangeError } from '../../../src/services/analytics/domain/errors/InvalidAnalyticsRangeError';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAnalyticsRepository } from './testDoubles';
import { DateRange } from '../../../src/services/analytics/domain/AnalyticsMetrics';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function rangeOfDays(days: number): DateRange {
  const to = new Date('2026-07-10T00:00:00.000Z');
  const from = new Date(to.getTime() - days * MS_PER_DAY);
  return { from, to };
}

function buildService(): {
  service: AnalyticsService;
  analyticsRepository: FakeAnalyticsRepository;
  tenantRepository: FakeTenantRepository;
} {
  const analyticsRepository = new FakeAnalyticsRepository();
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: 'hash-qualquer' });
  const service = new AnalyticsService(analyticsRepository, tenantRepository, new NoopLogger());
  return { service, analyticsRepository, tenantRepository };
}

describe('AnalyticsService (Milestone 4, Bloco M4B)', () => {
  describe('validacao de tenant (mesmo padrao dos Services do Bloco 5)', () => {
    it('lanca TenantNotFoundError quando o tenant nao existe, ANTES de tocar o AnalyticsRepository', async () => {
      const { service, analyticsRepository } = buildService();

      await expect(service.getAiUsage('tenant-inexistente', rangeOfDays(7))).rejects.toThrow(TenantNotFoundError);
      expect(analyticsRepository.aiUsageCalls).toHaveLength(0);
    });

    it('getConversationStatusCounts tambem valida o tenant', async () => {
      const { service } = buildService();

      await expect(service.getConversationStatusCounts('tenant-inexistente')).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('validacao de faixa de tempo (D48)', () => {
    it('lanca InvalidAnalyticsRangeError quando from e posterior a to', async () => {
      const { service } = buildService();
      const invalid: DateRange = { from: new Date('2026-07-10T00:00:00Z'), to: new Date('2026-07-01T00:00:00Z') };

      await expect(service.getAiUsage('tenant-1', invalid)).rejects.toThrow(InvalidAnalyticsRangeError);
    });

    it('lanca InvalidAnalyticsRangeError quando a janela excede MAX_WINDOW_DAYS', async () => {
      const { service, analyticsRepository } = buildService();

      await expect(service.getAiUsage('tenant-1', rangeOfDays(MAX_WINDOW_DAYS + 1))).rejects.toThrow(InvalidAnalyticsRangeError);
      expect(analyticsRepository.aiUsageCalls).toHaveLength(0);
    });

    it('aceita uma janela de exatamente MAX_WINDOW_DAYS (limite inclusivo)', async () => {
      const { service, analyticsRepository } = buildService();

      await service.getAiUsage('tenant-1', rangeOfDays(MAX_WINDOW_DAYS));

      expect(analyticsRepository.aiUsageCalls).toHaveLength(1);
    });

    it('lanca InvalidAnalyticsRangeError para datas invalidas (NaN)', async () => {
      const { service } = buildService();
      const invalid: DateRange = { from: new Date('data-invalida'), to: new Date('2026-07-10T00:00:00Z') };

      await expect(service.getMessageFlow('tenant-1', invalid)).rejects.toThrow(InvalidAnalyticsRangeError);
    });
  });

  describe('delegacao ao repositorio', () => {
    it('getAiUsage delega tenantId+range e repassa o resultado, com costUsd preservado como string (D46)', async () => {
      const { service, analyticsRepository } = buildService();
      const range = rangeOfDays(7);
      analyticsRepository.seedAiUsage([
        {
          date: '2026-07-05',
          interactions: 3,
          successCount: 2,
          validationRejectedCount: 0,
          providerErrorCount: 1,
          tokensInput: 100,
          tokensOutput: 50,
          costUsd: '0.00123456',
          avgLatencyMs: 420,
        },
      ]);

      const result = await service.getAiUsage('tenant-1', range);

      expect(analyticsRepository.aiUsageCalls[0]).toEqual({ tenantId: 'tenant-1', range });
      expect(result[0].costUsd).toBe('0.00123456');
      expect(typeof result[0].costUsd).toBe('string');
    });

    it('getMessageFlow delega e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedMessageFlow([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);

      const result = await service.getMessageFlow('tenant-1', rangeOfDays(7));

      expect(analyticsRepository.messageFlowCalls).toHaveLength(1);
      expect(result).toEqual([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);
    });

    it('getNewConversations delega e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedNewConversations([{ date: '2026-07-05', count: 4 }]);

      const result = await service.getNewConversations('tenant-1', rangeOfDays(7));

      expect(analyticsRepository.newConversationsCalls).toHaveLength(1);
      expect(result).toEqual([{ date: '2026-07-05', count: 4 }]);
    });

    it('getConversationStatusCounts delega sem range e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedConversationStatusCounts({ bot: 12, human: 3 });

      const result = await service.getConversationStatusCounts('tenant-1');

      expect(analyticsRepository.conversationStatusCountsCalls).toEqual(['tenant-1']);
      expect(result).toEqual({ bot: 12, human: 3 });
    });

    it('getSessionStability delega e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedSessionStability([{ date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0 }]);

      const result = await service.getSessionStability('tenant-1', rangeOfDays(7));

      expect(analyticsRepository.sessionStabilityCalls).toHaveLength(1);
      expect(result[0].connected).toBe(2);
    });
  });
});
