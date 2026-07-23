import { PrismaAnalyticsRepository } from '../../../../src/services/analytics/infrastructure/repositories/PrismaAnalyticsRepository';
import type { PrismaClient } from '@prisma/client';

/**
 * Testes de `PrismaAnalyticsRepository` (Milestone 4, Bloco M4C) com o
 * `$queryRaw` MOCKADO — nenhuma conexao real ao Postgres. Verificam: (1) a
 * transformacao SQL -> DTO acontece no repositorio; (2) toda consulta e
 * PARAMETRIZADA (o `tenantId`/datas viajam em `.values` do objeto `Prisma.sql`,
 * nunca concatenados — teste anti-injection); (3) `costUsd` preservado como
 * string (D46).
 */
function buildRepo(): { repo: PrismaAnalyticsRepository; queryRaw: jest.Mock } {
  const queryRaw = jest.fn();
  const fakePrisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
  return { repo: new PrismaAnalyticsRepository(fakePrisma), queryRaw };
}

const RANGE = { from: new Date('2026-07-01T00:00:00.000Z'), to: new Date('2026-07-10T00:00:00.000Z') };

describe('PrismaAnalyticsRepository (Milestone 4, Bloco M4C)', () => {
  it('aiUsageByPeriod mapeia linhas -> DTO e preserva costUsd como string (D46)', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([
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

    const result = await repo.aiUsageByPeriod('tenant-1', RANGE);

    expect(result).toHaveLength(1);
    expect(result[0].costUsd).toBe('0.00123456');
    expect(typeof result[0].costUsd).toBe('string');
    expect(result[0].interactions).toBe(3);
  });

  it('aiUsageByPeriod parametriza tenantId + datas (anti-injection: viajam em Prisma.sql .values, nao concatenados)', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([]);

    await repo.aiUsageByPeriod('tenant-1', RANGE);

    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlArg.values).toContain('tenant-1');
    expect(sqlArg.values).toContain(RANGE.from);
    expect(sqlArg.values).toContain(RANGE.to);
  });

  it('messageFlowByPeriod mapeia -> DTO e parametriza tenantId', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);

    const result = await repo.messageFlowByPeriod('tenant-9', RANGE);

    expect(result).toEqual([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlArg.values).toContain('tenant-9');
  });

  it('newConversationsByPeriod mapeia -> DTO', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([{ date: '2026-07-05', count: 4 }]);

    const result = await repo.newConversationsByPeriod('tenant-1', RANGE);

    expect(result).toEqual([{ date: '2026-07-05', count: 4 }]);
  });

  it('conversationStatusCounts devolve o unico registro agregado (sem faixa de tempo) e parametriza tenantId', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([{ bot: 12, human: 3 }]);

    const result = await repo.conversationStatusCounts('tenant-1');

    expect(result).toEqual({ bot: 12, human: 3 });
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlArg.values).toContain('tenant-1');
  });

  it('conversationStatusCounts devolve zeros quando nao ha linhas', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([]);

    const result = await repo.conversationStatusCounts('tenant-1');

    expect(result).toEqual({ bot: 0, human: 0 });
  });

  it('sessionStabilityByPeriod mapeia -> DTO', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([{ date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0 }]);

    const result = await repo.sessionStabilityByPeriod('tenant-1', RANGE);

    expect(result[0]).toEqual({ date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0 });
  });
});
