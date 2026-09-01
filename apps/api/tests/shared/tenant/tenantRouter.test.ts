import express, { Express } from 'express';
import request from 'supertest';
import { createTenantRouter } from '../../../src/shared/tenant/presentation/tenantRouter';
import { createAuthenticate } from '../../../src/shared/presentation/authenticate';
import { Hs256AccessTokenService } from '../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { NoopLogger } from '../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeApiKeyHasher } from '../security/FakeApiKeyHasher';
import { FakeTenantRepository } from './FakeTenantRepository';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';

/**
 * Reorganizacao Perfil/Configuracoes (2026-08-27) — aba "Empresa". Mesmo
 * padrao de `authIntegration.test.ts`: monta um Express real com
 * `authenticate` na frente (o mesmo porteiro dois-planos usado em producao),
 * para provar o gate de `tenant:manage` (so OWNER) de ponta a ponta, nao so
 * a logica isolada do router.
 */
function buildApp(): { app: Express; access: Hs256AccessTokenService; tenants: FakeTenantRepository } {
  const access = new Hs256AccessTokenService(SECRET, 900);
  const hasher = new FakeApiKeyHasher();
  const tenants = new FakeTenantRepository();
  tenants.seed({
    id: 'tenant-1',
    name: 'Empresa Original',
    apiKeyHash: hasher.hash('chave-1'),
    plan: 'free',
  });

  const authenticate = createAuthenticate(access, hasher, tenants, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId', authenticate, createTenantRouter(tenants));
  return { app, access, tenants };
}

describe('tenantRouter (Reorganizacao Perfil/Configuracoes)', () => {
  describe('GET /', () => {
    it('sem autenticacao: 401', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/api/tenants/tenant-1');
      expect(res.status).toBe(401);
    });

    it('qualquer papel autenticado ve o nome e o plano do tenant', async () => {
      const { app, access } = buildApp();
      const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'operator' });
      const res = await request(app)
        .get('/api/tenants/tenant-1')
        .set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      // Trava de plano (Lançamento suave, 2026-08-31) — o Dashboard lê `plan`
      // deste endpoint para decidir o que liberar/bloquear na UI.
      expect(res.body.tenant).toEqual({ id: 'tenant-1', name: 'Empresa Original', plan: 'free' });
    });

    it('tenant inexistente: 404', async () => {
      const { app, access } = buildApp();
      const token = access.issue({ userId: 'u1', tenantId: 'tenant-2', role: 'operator' });
      const res = await request(app)
        .get('/api/tenants/tenant-2')
        .set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /', () => {
    it('operator (sem tenant:manage): 403', async () => {
      const { app, access } = buildApp();
      const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'operator' });
      const res = await request(app)
        .patch('/api/tenants/tenant-1')
        .set('authorization', `Bearer ${token}`)
        .send({ name: 'Novo Nome' });
      expect(res.status).toBe(403);
    });

    it('administrator (sem tenant:manage): 403', async () => {
      const { app, access } = buildApp();
      const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'administrator' });
      const res = await request(app)
        .patch('/api/tenants/tenant-1')
        .set('authorization', `Bearer ${token}`)
        .send({ name: 'Novo Nome' });
      expect(res.status).toBe(403);
    });

    it('owner: 200, nome atualizado', async () => {
      const { app, access, tenants } = buildApp();
      const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'owner' });
      const res = await request(app)
        .patch('/api/tenants/tenant-1')
        .set('authorization', `Bearer ${token}`)
        .send({ name: 'Novo Nome' });
      expect(res.status).toBe(200);
      expect(res.body.tenant.name).toBe('Novo Nome');
      expect((await tenants.findById('tenant-1'))?.name).toBe('Novo Nome');
    });

    it('name vazio: 400', async () => {
      const { app, access } = buildApp();
      const token = access.issue({ userId: 'u1', tenantId: 'tenant-1', role: 'owner' });
      const res = await request(app)
        .patch('/api/tenants/tenant-1')
        .set('authorization', `Bearer ${token}`)
        .send({ name: '' });
      expect(res.status).toBe(400);
    });
  });
});
