import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import { PrismaSupportAccessRepository } from '../../src/services/platform/infrastructure/repositories/PrismaSupportAccessRepository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

jest.setTimeout(30_000);

/**
 * Painel /admin, Fase 5 — o ciclo de acesso assistido contra um Postgres REAL.
 * Um Fake nunca provaria que a coluna/enum existem, que `updateMany` filtra por
 * id, nem que `markExpiredStale` roda o `UPDATE ... WHERE status='ACCEPTED'`.
 *
 * Pula (não falha) se o Postgres estiver fora — mas o pulo é ALTO E VISÍVEL
 * (lição do L1): se "passar" sem rodar, o `console.warn` aparece.
 */
describe('Integração real — Acesso assistido (Fase 5)', () => {
  let prisma: PrismaClient;
  let repository: PrismaSupportAccessRepository;
  let databaseAvailable = true;
  const tenantId = `test-tenant-support-${Date.now()}`;
  const platformUserId = `test-admin-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.tenant.create({ data: { id: tenantId, name: 'Tenant de teste Fase 5' } });
    } catch {
      databaseAvailable = false;
    }
    repository = new PrismaSupportAccessRepository(prisma);
  });

  afterAll(async () => {
    if (databaseAvailable) {
      await prisma.tenantAccessRequest.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await prisma.$disconnect();
  });

  it('ciclo completo: create → verify(pending) → accept → verify(ok) → revoke → verify(ended)', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 5.');
      return;
    }

    const created = await repository.create({ tenantId, platformUserId, reason: 'ver a IA' });
    expect(created.status).toBe('pending');

    // Ainda pending: o porteiro nega.
    expect(await repository.verify(created.id)).toEqual({ ok: false, reason: 'not_yet_accepted' });

    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await repository.updateStatus(created.id, 'accepted', {
      respondedAt: new Date(),
      respondedByUserId: 'user-9',
      expiresAt,
    });

    expect(await repository.verify(created.id)).toEqual({
      ok: true,
      tenantId,
      platformUserId,
    });

    // "Um pedido aberto por vez": findActiveOrPendingByTenant encontra este.
    expect((await repository.findActiveOrPendingByTenant(tenantId))?.id).toBe(created.id);

    await repository.updateStatus(created.id, 'revoked');
    expect(await repository.verify(created.id)).toEqual({ ok: false, reason: 'ended' });
    expect(await repository.findActiveOrPendingByTenant(tenantId)).toBeNull();
  });

  it('markExpiredStale vira ACCEPTED vencido em EXPIRED', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 5.');
      return;
    }

    const created = await repository.create({ tenantId, platformUserId, reason: 'vai vencer' });
    await repository.updateStatus(created.id, 'accepted', {
      respondedAt: new Date(),
      respondedByUserId: 'user-9',
      expiresAt: new Date(Date.now() - 1000),
    });

    const swept = await repository.markExpiredStale(new Date());
    expect(swept).toBeGreaterThanOrEqual(1);
    expect((await repository.findById(created.id))?.status).toBe('expired');
    expect(await repository.verify(created.id)).toEqual({ ok: false, reason: 'ended' });
  });

  it('updateStatus com id inexistente → null', async () => {
    if (!databaseAvailable) {
      console.warn('Postgres indisponível — pulando teste de integração real da Fase 5.');
      return;
    }
    expect(await repository.updateStatus('id-que-nao-existe', 'revoked')).toBeNull();
  });
});
