import { PrismaAnalyticsRepository } from '../../../../src/services/analytics/infrastructure/repositories/PrismaAnalyticsRepository';
import type { PrismaClient } from '@prisma/client';

/**
 * Testes de `PrismaAnalyticsRepository` (Milestone 4, Bloco M4C) com o
 * `$queryRaw` MOCKADO — nenhuma conexao real ao Postgres. Verificam: (1) a
 * transformacao SQL -> DTO acontece no repositorio; (2) toda consulta e
 * PARAMETRIZADA (o `tenantId`/`sessionName`/datas viajam em `.values` do
 * objeto `Prisma.sql`, nunca concatenados — teste anti-injection); (3)
 * `costUsd` preservado como string (D46).
 *
 * Milestone 6, Bloco M6H-4 (2026-07-26): toda consulta passou a exigir
 * `sessionName` — os testes verificam que ele tambem viaja parametrizado.
 */
function buildRepo(): { repo: PrismaAnalyticsRepository; queryRaw: jest.Mock } {
  const queryRaw = jest.fn();
  const fakePrisma = { $queryRaw: queryRaw } as unknown as PrismaClient;
  return { repo: new PrismaAnalyticsRepository(fakePrisma), queryRaw };
}

const RANGE = {
  from: new Date('2026-07-01T00:00:00.000Z'),
  to: new Date('2026-07-10T00:00:00.000Z'),
};
const SESSION = 'sessao-1';

describe('PrismaAnalyticsRepository (Milestone 4, Bloco M4C; por sessão desde M6H-4)', () => {
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

    const result = await repo.aiUsageByPeriod('tenant-1', SESSION, RANGE);

    expect(result).toHaveLength(1);
    expect(result[0].costUsd).toBe('0.00123456');
    expect(typeof result[0].costUsd).toBe('string');
    expect(result[0].interactions).toBe(3);
  });

  it('aiUsageByPeriod parametriza tenantId + sessionName + datas (anti-injection: viajam em Prisma.sql .values, nao concatenados)', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([]);

    await repo.aiUsageByPeriod('tenant-1', SESSION, RANGE);

    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sqlArg.values).toContain('tenant-1');
    expect(sqlArg.values).toContain(SESSION);
    expect(sqlArg.values).toContain(RANGE.from);
    expect(sqlArg.values).toContain(RANGE.to);
    expect(sqlArg.sql).toContain('INNER JOIN "whatsapp_conversations"');
  });

  it('messageFlowByPeriod mapeia -> DTO, parametriza tenantId + sessionName e usa JOIN', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);

    const result = await repo.messageFlowByPeriod('tenant-9', SESSION, RANGE);

    expect(result).toEqual([{ date: '2026-07-05', inbound: 10, outbound: 7 }]);
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sqlArg.values).toContain('tenant-9');
    expect(sqlArg.values).toContain(SESSION);
    expect(sqlArg.sql).toContain('INNER JOIN "whatsapp_conversations"');
  });

  it('newConversationsByPeriod mapeia -> DTO e parametriza sessionName (filtro direto, sem join)', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([{ date: '2026-07-05', count: 4 }]);

    const result = await repo.newConversationsByPeriod('tenant-1', SESSION, RANGE);

    expect(result).toEqual([{ date: '2026-07-05', count: 4 }]);
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sqlArg.values).toContain(SESSION);
    expect(sqlArg.sql).not.toContain('JOIN');
  });

  it('conversationStatusCounts devolve o unico registro agregado (sem faixa de tempo) e parametriza tenantId + sessionName', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([{ bot: 12, human: 3 }]);

    const result = await repo.conversationStatusCounts('tenant-1', SESSION);

    expect(result).toEqual({ bot: 12, human: 3 });
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sqlArg.values).toContain('tenant-1');
    expect(sqlArg.values).toContain(SESSION);
  });

  it('conversationStatusCounts devolve zeros quando nao ha linhas', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([]);

    const result = await repo.conversationStatusCounts('tenant-1', SESSION);

    expect(result).toEqual({ bot: 0, human: 0 });
  });

  it('sessionStabilityByPeriod mapeia -> DTO e parametriza sessionName (filtro direto, sem join)', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([
      { date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0 },
    ]);

    const result = await repo.sessionStabilityByPeriod('tenant-1', SESSION, RANGE);

    expect(result[0]).toEqual({ date: '2026-07-05', connected: 2, disconnected: 1, connecting: 0 });
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sqlArg.values).toContain(SESSION);
    expect(sqlArg.sql).not.toContain('JOIN');
  });

  // Fase 1, Bloco F1.6 — Analytics de NEGOCIO.
  it('pipelineFunnelCounts devolve o retrato agregado por estagio (sem faixa de tempo) e parametriza tenantId + sessionName', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([
      { new: 10, contacted: 5, negotiating: 3, closed_won: 2, closed_lost: 1 },
    ]);

    const result = await repo.pipelineFunnelCounts('tenant-1', SESSION);

    expect(result).toEqual({
      new: 10,
      contacted: 5,
      negotiating: 3,
      closed_won: 2,
      closed_lost: 1,
    });
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sqlArg.values).toContain('tenant-1');
    expect(sqlArg.values).toContain(SESSION);
    expect(sqlArg.sql).not.toContain('JOIN');
    expect(sqlArg.sql).toContain("'CLOSED_WON'");
    // ADR #94 (2026-08-01) — conversas fora do funil comercial nunca entram na contagem.
    expect(sqlArg.sql).toContain('excluded_from_pipeline');
  });

  it('pipelineFunnelCounts devolve zeros quando nao ha linhas', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([]);

    const result = await repo.pipelineFunnelCounts('tenant-1', SESSION);

    expect(result).toEqual({ new: 0, contacted: 0, negotiating: 0, closed_won: 0, closed_lost: 0 });
  });

  it('escalationRateByPeriod mapeia -> DTO e parametriza sessionName + range (filtro direto, sem join)', async () => {
    const { repo, queryRaw } = buildRepo();
    queryRaw.mockResolvedValue([
      { date: '2026-07-05', totalConversations: 8, escalatedConversations: 3 },
    ]);

    const result = await repo.escalationRateByPeriod('tenant-1', SESSION, RANGE);

    expect(result).toEqual([
      { date: '2026-07-05', totalConversations: 8, escalatedConversations: 3 },
    ]);
    const sqlArg = queryRaw.mock.calls[0][0] as { values: unknown[]; sql: string };
    expect(sqlArg.values).toContain(SESSION);
    expect(sqlArg.values).toContain(RANGE.from);
    expect(sqlArg.values).toContain(RANGE.to);
    expect(sqlArg.sql).not.toContain('JOIN');
    expect(sqlArg.sql).toContain('escalated_at');
  });
});
