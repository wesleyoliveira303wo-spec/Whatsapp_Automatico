import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaTenantRepository } from '../../src/shared/tenant/infrastructure/PrismaTenantRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

jest.setTimeout(30_000);

/**
 * Painel /admin, Fase 4 — a PRIMEIRA escrita cross-tenant contra um Postgres
 * REAL. Um Fake nunca provaria que a coluna `tenants.status` existe, que o
 * default é `ACTIVE`, nem que o enum `user_status` foi reaproveitado sem
 * migration nova de tipo.
 *
 * Pula (não falha) se o Postgres estiver fora — mas o pulo é ALTO E VISÍVEL
 * (lição do L1): se este teste "passar" sem rodar, o `console.warn` aparece.
 */
describe('Integração real — Controle do tenant (Fase 4)', () => {
  let prisma: PrismaClient;
  let repository: PrismaTenantRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-control-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste Fase 4' } });
    } catch {
      databaseAvailable = false;
    }
    repository = new PrismaTenantRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('todo tenant nasce ACTIVE (default da coluna, sem backfill explícito)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 4.');
      return;
    }

    const tenant = await repository.findById(tenantId);
    expect(tenant?.status).toBe('active');
  });

  it('setStatus persiste suspended/active e changePlan persiste o plano; id inexistente → undefined', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 4.');
      return;
    }

    const suspended = await repository.setStatus(tenantId, 'suspended');
    expect(suspended?.status).toBe('suspended');
    expect((await repository.findById(tenantId))?.status).toBe('suspended');

    const reactivated = await repository.setStatus(tenantId, 'active');
    expect(reactivated?.status).toBe('active');

    const onPro = await repository.changePlan(tenantId, 'pro');
    expect(onPro?.plan).toBe('pro');
    expect((await repository.findById(tenantId))?.plan).toBe('pro');

    await expect(repository.setStatus('id-que-nao-existe', 'suspended')).resolves.toBeUndefined();
  });
});
