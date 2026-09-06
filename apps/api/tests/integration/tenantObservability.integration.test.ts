import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaTenantObservabilityRepository } from '../../src/services/platform/infrastructure/repositories/PrismaTenantObservabilityRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

jest.setTimeout(30_000);

/**
 * Fase 2 do `/admin` — a leitura cross-tenant do Centro de Tenants contra um
 * Postgres REAL.
 *
 * Por que integração e não só Fake: o `PrismaTenantObservabilityRepository` é
 * quase inteiramente SQL cru (`$queryRaw` com `FILTER`, `bool_or`, `btrim`,
 * `::text`). Um Fake provaria só que o Fake foi escrito como se esperava —
 * nunca que o SQL compila no Postgres, que as colunas existem, e que os
 * agregados voltam no formato certo (contagem como número, custo como
 * string).
 *
 * Deliberadamente pequeno (mesmo espírito de `contactIdentity.integration`):
 * só o que exige banco de verdade. Pula (não falha) se o Postgres estiver
 * fora — mas o pulo é ALTO E VISÍVEL (a lição do L1): se este teste "passar"
 * sem rodar, o `console.warn` abaixo tem que aparecer.
 */
describe('Integração real — Centro de Tenants (Fase 2)', () => {
  let prisma: PrismaClient;
  let repository: PrismaTenantObservabilityRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-observability-${Date.now()}`;
  const range = {
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste Fase 2' } });
      await prisma.user.create({
        data: {
          tenantId,
          email: `obs-${Date.now()}@teste.local`,
          passwordHash: 'x',
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
      await prisma.whatsAppSession.create({
        data: { tenantId, sessionName: 'Sessão Teste', status: 'DISCONNECTED' },
      });
      await prisma.aiBusinessProfile.create({
        data: { tenantId, sessionName: 'Sessão Teste', content: 'texto do cérebro' },
      });
    } catch {
      databaseAvailable = false;
    }
    repository = new PrismaTenantObservabilityRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('listTenantOverviews inclui o tenant novo com os agregados no formato certo', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 2.');
      return;
    }

    const overviews = await repository.listTenantOverviews(range);
    const mine = overviews.find((o) => o.id === tenantId);

    expect(mine).toBeDefined();
    expect(mine!.sessionCount).toBe(1);
    expect(mine!.connectedSessionCount).toBe(0);
    expect(mine!.userCount).toBe(1);
    expect(mine!.aiProfileConfigured).toBe(true);
    // Contagens são números JS, não BigInt.
    expect(typeof mine!.messages30d.inbound).toBe('number');
    // Custo é STRING decimal exata (D46), nunca number.
    expect(typeof mine!.ai30d.costUsd).toBe('string');
    // Sem mensagem/IA/conversa nenhuma → tudo zero, nada undefined.
    expect(mine!.messages30d).toEqual({ inbound: 0, outbound: 0 });
    expect(mine!.ai30d.total).toBe(0);
    expect(mine!.conversations30d).toEqual({ total: 0, escalated: 0 });
    expect(mine!.lastActivityAt).toBeNull();
  });

  it('a lista faz um número FIXO de consultas — não uma por tenant', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 2.');
      return;
    }

    const spy = jest.spyOn(prisma, '$queryRaw');
    try {
      await repository.listTenantOverviews(range);
      // 8 agregações (§6.4), independente de quantos tenants existem no banco.
      expect(spy).toHaveBeenCalledTimes(8);
    } finally {
      spy.mockRestore();
    }
  });

  it('getTenantDetail devolve sessões, campanhas, contatos e eventos; null para id inexistente', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 2.');
      return;
    }

    const detail = await repository.getTenantDetail(tenantId, range);
    expect(detail).not.toBeNull();
    expect(detail!.sessions).toHaveLength(1);
    expect(detail!.sessions[0]).toMatchObject({
      sessionName: 'Sessão Teste',
      status: 'disconnected',
      aiProfileConfigured: true,
    });
    expect(detail!.campaigns).toEqual({ total: 0, running: 0, paused: 0, pausedByBreaker: 0 });
    expect(detail!.contactCount).toBe(0);
    expect(detail!.recentSessionEvents).toEqual([]);

    await expect(repository.getTenantDetail('id-que-nao-existe', range)).resolves.toBeNull();
  });

  it('platformTotals soma a plataforma inteira no formato certo (Fase 3, §5.2)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 3.');
      return;
    }

    const totals = await repository.platformTotals(range);

    // Números, não BigInt.
    expect(typeof totals.tenants.total).toBe('number');
    expect(typeof totals.users).toBe('number');
    expect(typeof totals.sessions.total).toBe('number');
    // Custo é STRING decimal exata (D46).
    expect(typeof totals.ai30d.costUsd).toBe('string');
    // O tenant/usuário/sessão de teste criados no beforeAll estão contados.
    expect(totals.tenants.total).toBeGreaterThanOrEqual(1);
    expect(totals.tenants.byPlan.free).toBeGreaterThanOrEqual(1);
    expect(totals.users).toBeGreaterThanOrEqual(1);
    expect(totals.sessions.total).toBeGreaterThanOrEqual(1);
  });

  it('listAllSessions devolve (tenantId, sessionName, status) de todos os tenants', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 3.');
      return;
    }

    const sessions = await repository.listAllSessions();
    const mine = sessions.find((s) => s.tenantId === tenantId);

    expect(mine).toMatchObject({ sessionName: 'Sessão Teste', status: 'DISCONNECTED' });
  });
});
