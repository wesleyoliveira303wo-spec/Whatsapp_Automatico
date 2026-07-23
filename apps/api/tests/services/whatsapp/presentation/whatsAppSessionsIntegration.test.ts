import express, { Express } from 'express';
import request from 'supertest';
import { createAuthenticate } from '../../../../src/shared/presentation/authenticate';
import { Hs256AccessTokenService } from '../../../../src/services/auth/infrastructure/Hs256AccessTokenService';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { createWhatsAppSessionsRouter } from '../../../../src/services/whatsapp/presentation/whatsAppSessionsRouter';
import { createWhatsAppErrorHandler } from '../../../../src/services/whatsapp/presentation/whatsAppErrorHandler';
import { WhatsAppConnectionRegistry } from '../../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppSessionService } from '../../../../src/services/whatsapp/application/WhatsAppSessionService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeWhatsAppProviderFactory } from '../infrastructure/FakeWhatsAppProviderFactory';
import { FakeWhatsAppSessionRepository, FakeCredentialsStore, FakeWhatsAppSessionEventRepository } from '../testDoubles';
import { FakeApiKeyHasher } from '../../../shared/security/FakeApiKeyHasher';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAuditLogRepository } from '../../auth/testDoubles';

const SECRET = 'segredo-de-teste-bem-comprido-1234567890';
/** Instancia so para EMITIR craxas nos testes; verifica contra o mesmo SECRET usado no `authenticate` de `buildApp`. */
const access = new Hs256AccessTokenService(SECRET, 900);
function bearer(userId: string, role: UserRole, tenantId = 'tenant-1'): string {
  return `Bearer ${access.issue({ userId, tenantId, role })}`;
}

/**
 * Teste de integracao (Production Hardening, Bloco 7) - a unica verificacao
 * automatizada que exercita a cadeia completa exatamente como `index.ts` a
 * monta em producao:
 *
 *   HTTP -> requireApiKey -> resolveTenantFromApiKey -> WhatsAppSessionService
 *        -> WhatsAppConnectionRegistry -> SessionManager -> Provider
 *
 * Existe separado de `requireApiKey.test.ts` (que testa so o middleware
 * isolado) e de `whatsAppSessionsRouter.test.ts` (que testa so o router
 * isolado, sem autenticacao na frente) porque nenhum dos dois, sozinho,
 * comprova que o C1/IDOR esta de fato fechado quando as duas pecas sao
 * montadas juntas - so a composicao real (`requireApiKey` montado ANTES do
 * router, no mesmo path, como em `index.ts`) permite essa verificacao.
 *
 * Usa exatamente as mesmas Fakes dos demais testes deste modulo - nenhuma
 * peca nova, nenhuma implementacao concreta (Prisma/HMAC real) precisa
 * entrar aqui: o objetivo e provar a FIACAO (wiring), nao redigitar testes ja
 * cobertos de cada peca isolada.
 */
function buildApp(): Express {
  const hasher = new FakeApiKeyHasher();
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: hasher.hash('chave-tenant-1') });
  tenantRepository.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: hasher.hash('chave-tenant-2') });

  const sessionRepository = new FakeWhatsAppSessionRepository();
  const eventRepository = new FakeWhatsAppSessionEventRepository();
  const registry = new WhatsAppConnectionRegistry(new FakeWhatsAppProviderFactory(), sessionRepository, new NoopLogger(), eventRepository);
  const sessionService = new WhatsAppSessionService(
    registry,
    tenantRepository,
    new NoopLogger(),
    sessionRepository,
    new FakeCredentialsStore(),
    eventRepository,
    new FakeAuditLogRepository(),
  );
  // M5D-3: `authenticate` (dois-planos) no lugar de `requireApiKey` — chave da
  // empresa (maquina) OU craxa de pessoa (RBAC no router). Mesmo SECRET do
  // `access` de modulo, para os craxas emitidos nos testes validarem aqui.
  const authenticate = createAuthenticate(new Hs256AccessTokenService(SECRET, 900), hasher, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use('/api/tenants/:tenantId/whatsapp-sessions', authenticate, createWhatsAppSessionsRouter(sessionService));
  // Milestone 3, Bloco 5 (D17) - montado ESCOPADO ao path do proprio router,
  // nao mais globalmente sem path (correcao do bug de encadeamento de error
  // handlers - ver docstring de `createWhatsAppErrorHandler`/`index.ts`).
  app.use('/api/tenants/:tenantId/whatsapp-sessions', createWhatsAppErrorHandler(new NoopLogger()));
  return app;
}

describe('Integracao requireApiKey + whatsAppSessionsRouter (fluxo HTTP real, Production Hardening Bloco 7)', () => {
  it('sem credencial alguma, nenhuma rota de sessao e alcancada (401)', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/tenants/tenant-1/whatsapp-sessions').send({ sessionName: 'vendas' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'missing_credentials' });
  });

  it('[fecha o IDOR] API key valida do tenant-1 nao abre uma sessao em nome do tenant-2 (403, sem tocar o Registry)', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/tenants/tenant-2/whatsapp-sessions')
      .set('x-api-key', 'chave-tenant-1')
      .send({ sessionName: 'vendas' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  it('[fecha o IDOR] API key valida do tenant-1 nao le o status de uma sessao do tenant-2 (403)', async () => {
    const app = buildApp();
    // Sessao real criada para tenant-2 com a propria chave de tenant-2.
    await request(app).post('/api/tenants/tenant-2/whatsapp-sessions').set('x-api-key', 'chave-tenant-2').send({ sessionName: 'vendas' });

    // tenant-1 tenta ler essa mesma sessao pela URL de tenant-2, usando a propria chave (valida, mas de outro tenant).
    const response = await request(app).get('/api/tenants/tenant-2/whatsapp-sessions/vendas').set('x-api-key', 'chave-tenant-1');

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
  });

  it('com API key valida e tenantId correspondente, o fluxo completo funciona ponta a ponta (200)', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/tenants/tenant-1/whatsapp-sessions')
      .set('x-api-key', 'chave-tenant-1')
      .send({ sessionName: 'vendas' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tenantId: 'tenant-1', sessionName: 'vendas' });
  });

  it('API key de um tenant inexistente e rejeitada antes mesmo de chegar ao router (401)', async () => {
    const app = buildApp();

    const response = await request(app)
      .get('/api/tenants/tenant-1/whatsapp-sessions/vendas')
      .set('x-api-key', 'chave-que-nao-existe');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: 'invalid_api_key' });
  });

  describe('M2, Fase 1 - IDOR nas novas rotas (GET / lista e DELETE /:sessionName/remove)', () => {
    it('[fecha o IDOR] API key valida do tenant-1 nao lista as sessoes do tenant-2 (403, sem tocar o repositorio)', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-2/whatsapp-sessions').set('x-api-key', 'chave-tenant-2').send({ sessionName: 'vendas' });

      const response = await request(app).get('/api/tenants/tenant-2/whatsapp-sessions').set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
    });

    it('com API key correspondente, GET / lista so as proprias sessoes do tenant (200)', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-1/whatsapp-sessions').set('x-api-key', 'chave-tenant-1').send({ sessionName: 'vendas' });

      const response = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions').set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(200);
      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0]).toMatchObject({ tenantId: 'tenant-1', sessionName: 'vendas' });
    });

    it('[fecha o IDOR] API key valida do tenant-1 nao remove uma sessao do tenant-2 (403, sessao do tenant-2 permanece intacta)', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-2/whatsapp-sessions').set('x-api-key', 'chave-tenant-2').send({ sessionName: 'vendas' });

      const removeResponse = await request(app)
        .delete('/api/tenants/tenant-2/whatsapp-sessions/vendas/remove')
        .set('x-api-key', 'chave-tenant-1');

      expect(removeResponse.status).toBe(403);
      expect(removeResponse.body).toMatchObject({ error: 'tenant_mismatch' });

      // Prova que a rejeicao aconteceu ANTES de qualquer efeito colateral: a
      // sessao do tenant-2 continua existindo, visivel pela propria chave dele.
      const listResponse = await request(app).get('/api/tenants/tenant-2/whatsapp-sessions').set('x-api-key', 'chave-tenant-2');
      expect(listResponse.body.sessions).toHaveLength(1);
    });

    it('com API key correspondente, DELETE /:sessionName/remove remove de fato a propria sessao (204)', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-1/whatsapp-sessions').set('x-api-key', 'chave-tenant-1').send({ sessionName: 'vendas' });

      const response = await request(app).delete('/api/tenants/tenant-1/whatsapp-sessions/vendas/remove').set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(204);
    });
  });

  describe('M2, Fase 2 - IDOR na rota de historico (GET /:sessionName/history)', () => {
    it('[fecha o IDOR] API key valida do tenant-1 nao le o historico de uma sessao do tenant-2 (403)', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-2/whatsapp-sessions').set('x-api-key', 'chave-tenant-2').send({ sessionName: 'vendas' });

      const response = await request(app)
        .get('/api/tenants/tenant-2/whatsapp-sessions/vendas/history')
        .set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
    });

    it('com API key correspondente, GET /:sessionName/history responde 200 (200)', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-1/whatsapp-sessions').set('x-api-key', 'chave-tenant-1').send({ sessionName: 'vendas' });

      const response = await request(app)
        .get('/api/tenants/tenant-1/whatsapp-sessions/vendas/history')
        .set('x-api-key', 'chave-tenant-1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('events');
    });
  });

  describe('Milestone 5, Bloco M5D-3 — RBAC por craxa de pessoa', () => {
    it('ReadOnly pode LISTAR sessoes (session:read) — 200', async () => {
      const app = buildApp();
      const response = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions').set('authorization', bearer('ro-1', 'read_only'));
      expect(response.status).toBe(200);
    });

    it('ReadOnly NAO pode conectar sessao (falta session:connect) — 403 forbidden', async () => {
      const app = buildApp();
      const response = await request(app)
        .post('/api/tenants/tenant-1/whatsapp-sessions')
        .set('authorization', bearer('ro-1', 'read_only'))
        .send({ sessionName: 'vendas' });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'forbidden' });
    });

    it('Operator pode conectar (session:connect) — 200', async () => {
      const app = buildApp();
      const response = await request(app)
        .post('/api/tenants/tenant-1/whatsapp-sessions')
        .set('authorization', bearer('op-1', 'operator'))
        .send({ sessionName: 'vendas' });
      expect(response.status).toBe(200);
    });

    it('Operator NAO pode REMOVER sessao (falta session:remove) — 403 forbidden', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-1/whatsapp-sessions').set('x-api-key', 'chave-tenant-1').send({ sessionName: 'vendas' });

      const response = await request(app)
        .delete('/api/tenants/tenant-1/whatsapp-sessions/vendas/remove')
        .set('authorization', bearer('op-1', 'operator'));
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'forbidden' });
    });

    it('Administrator pode REMOVER sessao (session:remove) — 204', async () => {
      const app = buildApp();
      await request(app).post('/api/tenants/tenant-1/whatsapp-sessions').set('x-api-key', 'chave-tenant-1').send({ sessionName: 'vendas' });

      const response = await request(app)
        .delete('/api/tenants/tenant-1/whatsapp-sessions/vendas/remove')
        .set('authorization', bearer('adm-1', 'administrator'));
      expect(response.status).toBe(204);
    });

    it('[IDOR] craxa do tenant-1 nao acessa sessoes do tenant-2 — 403 tenant_mismatch', async () => {
      const app = buildApp();
      const response = await request(app)
        .get('/api/tenants/tenant-2/whatsapp-sessions')
        .set('authorization', bearer('op-1', 'operator'));
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ error: 'tenant_mismatch' });
    });
  });
});
