import {
  AnalyticsService,
  MAX_WINDOW_DAYS,
} from '../../../src/services/analytics/application/AnalyticsService';
import { InvalidAnalyticsRangeError } from '../../../src/services/analytics/domain/errors/InvalidAnalyticsRangeError';
import { TenantNotFoundError } from '../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../shared/tenant/FakeTenantRepository';
import { FakeAnalyticsRepository } from './testDoubles';
import { DateRange } from '../../../src/services/analytics/domain/AnalyticsMetrics';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SESSION = 'sessao-1';

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

describe('AnalyticsService (Milestone 4, Bloco M4B; por sessão desde M6H-4)', () => {
  describe('validacao de tenant (mesmo padrao dos Services do Bloco 5)', () => {
    it('lanca TenantNotFoundError quando o tenant nao existe, ANTES de tocar o AnalyticsRepository', async () => {
      const { service, analyticsRepository } = buildService();

      await expect(
        service.getAiUsage('tenant-inexistente', SESSION, rangeOfDays(7)),
      ).rejects.toThrow(TenantNotFoundError);
      expect(analyticsRepository.aiUsageCalls).toHaveLength(0);
    });

    it('getConversationStatusCounts tambem valida o tenant', async () => {
      const { service } = buildService();

      await expect(
        service.getConversationStatusCounts('tenant-inexistente', SESSION),
      ).rejects.toThrow(TenantNotFoundError);
    });

    it('getPipelineFunnel tambem valida o tenant (Fase 1, F1.6)', async () => {
      const { service } = buildService();

      await expect(service.getPipelineFunnel('tenant-inexistente', SESSION)).rejects.toThrow(
        TenantNotFoundError,
      );
    });

    it('getEscalationRate tambem valida o tenant (Fase 1, F1.6)', async () => {
      const { service } = buildService();

      await expect(
        service.getEscalationRate('tenant-inexistente', SESSION, rangeOfDays(7)),
      ).rejects.toThrow(TenantNotFoundError);
    });
  });

  describe('validacao de faixa de tempo (D48)', () => {
    it('lanca InvalidAnalyticsRangeError quando from e posterior a to', async () => {
      const { service } = buildService();
      const invalid: DateRange = {
        from: new Date('2026-07-10T00:00:00Z'),
        to: new Date('2026-07-01T00:00:00Z'),
      };

      await expect(service.getAiUsage('tenant-1', SESSION, invalid)).rejects.toThrow(
        InvalidAnalyticsRangeError,
      );
    });

    it('lanca InvalidAnalyticsRangeError quando a janela excede MAX_WINDOW_DAYS', async () => {
      const { service, analyticsRepository } = buildService();

      await expect(
        service.getAiUsage('tenant-1', SESSION, rangeOfDays(MAX_WINDOW_DAYS + 1)),
      ).rejects.toThrow(InvalidAnalyticsRangeError);
      expect(analyticsRepository.aiUsageCalls).toHaveLength(0);
    });

    it('aceita uma janela de exatamente MAX_WINDOW_DAYS (limite inclusivo)', async () => {
      const { service, analyticsRepository } = buildService();

      await service.getAiUsage('tenant-1', SESSION, rangeOfDays(MAX_WINDOW_DAYS));

      expect(analyticsRepository.aiUsageCalls).toHaveLength(1);
    });

    it('lanca InvalidAnalyticsRangeError para datas invalidas (NaN)', async () => {
      const { service } = buildService();
      const invalid: DateRange = {
        from: new Date('data-invalida'),
        to: new Date('2026-07-10T00:00:00Z'),
      };

      await expect(service.getMessageFlow('tenant-1', SESSION, invalid)).rejects.toThrow(
        InvalidAnalyticsRangeError,
      );
    });

    it('getEscalationRate tambem valida a faixa (Fase 1, F1.6)', async () => {
      const { service, analyticsRepository } = buildService();
      const invalid: DateRange = {
        from: new Date('2026-07-10T00:00:00Z'),
        to: new Date('2026-07-01T00:00:00Z'),
      };

      await expect(service.getEscalationRate('tenant-1', SESSION, invalid)).rejects.toThrow(
        InvalidAnalyticsRangeError,
      );
      expect(analyticsRepository.escalationRateCalls).toHaveLength(0);
    });
  });

  describe('delegacao ao repositorio', () => {
    it('getAiUsage delega tenantId+sessionName+range e repassa o resultado, com costUsd preservado como string (D46)', async () => {
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

      const result = await service.getAiUsage('tenant-1', SESSION, range);

      expect(analyticsRepository.aiUsageCalls[0]).toEqual({
        tenantId: 'tenant-1',
        sessionName: SESSION,
        range,
      });
      expect(result[0].costUsd).toBe('0.00123456');
      expect(typeof result[0].costUsd).toBe('string');
    });

    it('getMessageFlow delega e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedMessageFlow([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);

      const result = await service.getMessageFlow('tenant-1', SESSION, rangeOfDays(7));

      expect(analyticsRepository.messageFlowCalls).toHaveLength(1);
      expect(analyticsRepository.messageFlowCalls[0].sessionName).toBe(SESSION);
      expect(result).toEqual([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);
    });

    it('getNewConversations delega e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedNewConversations([{ date: '2026-07-05', count: 4 }]);

      const result = await service.getNewConversations('tenant-1', SESSION, rangeOfDays(7));

      expect(analyticsRepository.newConversationsCalls).toHaveLength(1);
      expect(analyticsRepository.newConversationsCalls[0].sessionName).toBe(SESSION);
      expect(result).toEqual([{ date: '2026-07-05', count: 4 }]);
    });

    it('getConversationStatusCounts delega sem range e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedConversationStatusCounts({ bot: 12, human: 3 });

      const result = await service.getConversationStatusCounts('tenant-1', SESSION);

      expect(analyticsRepository.conversationStatusCountsCalls).toEqual([
        { tenantId: 'tenant-1', sessionName: SESSION },
      ]);
      expect(result).toEqual({ bot: 12, human: 3 });
    });

    it('getSessionStability delega e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedSessionStability([
        { date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0 },
      ]);

      const result = await service.getSessionStability('tenant-1', SESSION, rangeOfDays(7));

      expect(analyticsRepository.sessionStabilityCalls).toHaveLength(1);
      expect(analyticsRepository.sessionStabilityCalls[0].sessionName).toBe(SESSION);
      expect(result[0].connected).toBe(2);
    });

    it('nao mistura resultados de sessoes diferentes do mesmo tenant (mesma instancia de service, chamadas sequenciais)', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedConversationStatusCounts({ bot: 5, human: 1 });

      await service.getConversationStatusCounts('tenant-1', 'sessao-a');
      await service.getConversationStatusCounts('tenant-1', 'sessao-b');

      expect(analyticsRepository.conversationStatusCountsCalls).toEqual([
        { tenantId: 'tenant-1', sessionName: 'sessao-a' },
        { tenantId: 'tenant-1', sessionName: 'sessao-b' },
      ]);
    });

    // Fase 1, Bloco F1.6 — Analytics de NEGOCIO.
    it('getPipelineFunnel delega sem range e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedPipelineFunnel({
        new: 10,
        contacted: 5,
        negotiating: 3,
        closed_won: 2,
        closed_lost: 1,
      });

      const result = await service.getPipelineFunnel('tenant-1', SESSION);

      expect(analyticsRepository.pipelineFunnelCalls).toEqual([
        { tenantId: 'tenant-1', sessionName: SESSION },
      ]);
      expect(result).toEqual({
        new: 10,
        contacted: 5,
        negotiating: 3,
        closed_won: 2,
        closed_lost: 1,
      });
    });

    it('getEscalationRate delega e repassa', async () => {
      const { service, analyticsRepository } = buildService();
      analyticsRepository.seedEscalationRate([
        { date: '2026-07-05', totalConversations: 8, escalatedConversations: 3 },
      ]);

      const result = await service.getEscalationRate('tenant-1', SESSION, rangeOfDays(7));

      expect(analyticsRepository.escalationRateCalls).toHaveLength(1);
      expect(analyticsRepository.escalationRateCalls[0].sessionName).toBe(SESSION);
      expect(result).toEqual([
        { date: '2026-07-05', totalConversations: 8, escalatedConversations: 3 },
      ]);
    });
  });
});
