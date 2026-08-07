import express, { Express } from 'express';
import request from 'supertest';
import { createWhatsAppSessionsRouter } from '../../../../src/services/whatsapp/presentation/whatsAppSessionsRouter';
import { createWhatsAppErrorHandler } from '../../../../src/services/whatsapp/presentation/whatsAppErrorHandler';
import { WhatsAppConnectionRegistry } from '../../../../src/services/whatsapp/application/WhatsAppConnectionRegistry';
import { WhatsAppSessionService } from '../../../../src/services/whatsapp/application/WhatsAppSessionService';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeWhatsAppProviderFactory } from '../infrastructure/FakeWhatsAppProviderFactory';
import {
  FakeWhatsAppSessionRepository,
  FakeCredentialsStore,
  FakeWhatsAppSessionEventRepository,
} from '../testDoubles';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAuditLogRepository } from '../../auth/testDoubles';
import { RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';

/**
 * `tenant-1` e `tenant-2` já existem no `FakeTenantRepository` de todo teste
 * deste arquivo (Production Hardening, Bloco 7): este router agora depende
 * de `WhatsAppSessionService`, que valida a existência do tenant ANTES de
 * delegar ao Registry — sem o seed abaixo, toda rota responderia 404
 * (`TenantNotFoundError`) por um motivo alheio ao que este arquivo testa
 * (ciclo de vida da sessão, não autenticação/autorização — isso é coberto
 * por `requireApiKey.test.ts`, que já testa o `tenant_mismatch`).
 */
function buildApp(): Express {
  return buildAppWithEventRepo().app;
}

/**
 * M2, Fase 2 — variante de `buildApp()` que também devolve o
 * `eventRepo` compartilhado, para os testes da rota de histórico poderem
 * semear eventos diretamente (via `append()`) sem precisar de um jeito de
 * disparar `status_changed` pela API HTTP (que não existe: `POST /` usa o
 * `NullWhatsAppProvider`, que nunca emite eventos por conta própria — ver
 * `FakeWhatsAppProviderFactory.ts`). `buildApp()`, acima, é só um wrapper
 * fino sobre esta função — mantém os 16+ call sites já existentes neste
 * arquivo funcionando sem qualquer alteração.
 */
function buildAppWithEventRepo(): { app: Express; eventRepo: FakeWhatsAppSessionEventRepository } {
  // Mesmo repositório passado ao Registry e ao Service (ver mesma nota em
  // WhatsAppSessionService.test.ts) — replica a topologia real, onde ambos
  // compartilham a mesma tabela via Prisma.
  const sessionRepository = new FakeWhatsAppSessionRepository();
  const eventRepo = new FakeWhatsAppSessionEventRepository();
  const registry = new WhatsAppConnectionRegistry(
    new FakeWhatsAppProviderFactory(),
    sessionRepository,
    new NoopLogger(),
    eventRepo,
  );
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Teste', apiKeyHash: null });
  tenantRepository.seed({ id: 'tenant-2', name: 'Outra Empresa', apiKeyHash: null });
  const credentialsStore = new FakeCredentialsStore();
  const sessionService = new WhatsAppSessionService(
    registry,
    tenantRepository,
    new NoopLogger(),
    sessionRepository,
    credentialsStore,
    eventRepo,
    new FakeAuditLogRepository(),
  );

  const app = express();
  app.use(express.json());
  // Este é um teste de UNIDADE do router (ciclo de vida da sessão), não de
  // autenticação. O router agora exige `req.principal` (via `requirePermission`,
  // M5D-3); em produção quem o resolve é o `authenticate` (coberto por
  // `authenticate.test.ts`/`whatsAppSessionsIntegration.test.ts`). Aqui
  // injetamos um principal MÁQUINA (chave da empresa = acesso total) para
  // isolar o que este arquivo testa.
  app.use('/api/tenants/:tenantId/whatsapp-sessions', (req, _res, next) => {
    (req as RequestWithPrincipal).principal = { kind: 'machine', tenantId: req.params.tenantId };
    next();
  });
  app.use('/api/tenants/:tenantId/whatsapp-sessions', createWhatsAppSessionsRouter(sessionService));
  app.use(createWhatsAppErrorHandler(new NoopLogger()));
  return { app, eventRepo };
}

describe('whatsAppSessionsRouter', () => {
  it('POST /api/tenants/:tenantId/whatsapp-sessions cria/conecta a sessão e responde 200 com o corpo da sessão', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/tenants/tenant-1/whatsapp-sessions')
      .send({ sessionName: 'vendas' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tenantId: 'tenant-1', sessionName: 'vendas' });
  });

  it('POST responde 400 quando sessionName está ausente/vazio no corpo', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/tenants/tenant-1/whatsapp-sessions').send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_params');
  });

  it('POST responde 400 quando tenantId no path é só espaço em branco', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/tenants/%20%20/whatsapp-sessions')
      .send({ sessionName: 'vendas' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_params');
  });

  it('GET .../:sessionName responde 404 (WhatsAppSessionNotFoundError) para sessão nunca conectada', async () => {
    const app = buildApp();

    const response = await request(app).get(
      '/api/tenants/tenant-1/whatsapp-sessions/nunca-existiu',
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('session_not_found');
  });

  it('GET .../:sessionName responde 200 depois de um POST de conexão', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/tenants/tenant-1/whatsapp-sessions')
      .send({ sessionName: 'vendas' });

    const response = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions/vendas');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ tenantId: 'tenant-1', sessionName: 'vendas' });
  });

  it('GET .../:sessionName/qrcode responde 200 com o QR do provider', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/tenants/tenant-1/whatsapp-sessions')
      .send({ sessionName: 'vendas' });

    const response = await request(app).get(
      '/api/tenants/tenant-1/whatsapp-sessions/vendas/qrcode',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ qrCode: expect.any(String) });
  });

  it('GET .../:sessionName/contacts/:contactJid/avatar responde 200 com avatarUrl (Milestone 6, Bloco M6H-2b)', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/tenants/tenant-1/whatsapp-sessions')
      .send({ sessionName: 'vendas' });

    const response = await request(app).get(
      '/api/tenants/tenant-1/whatsapp-sessions/vendas/contacts/5511888888888%40s.whatsapp.net/avatar',
    );

    // NullWhatsAppProvider (fake) é inerte por padrão — avatarUrl vem
    // undefined, mas a rota responde 200 (nunca 404 por ausência de foto,
    // ver docstring do router).
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ avatarUrl: undefined });
  });

  it('DELETE .../:sessionName responde 204, inclusive para sessão nunca conectada (idempotente)', async () => {
    const app = buildApp();

    const response = await request(app).delete(
      '/api/tenants/tenant-1/whatsapp-sessions/nunca-existiu',
    );

    expect(response.status).toBe(204);
  });

  it('isola tenants: sessão criada para tenant-1 não aparece para tenant-2 com o mesmo sessionName', async () => {
    const app = buildApp();
    await request(app)
      .post('/api/tenants/tenant-1/whatsapp-sessions')
      .send({ sessionName: 'vendas' });

    const response = await request(app).get('/api/tenants/tenant-2/whatsapp-sessions/vendas');

    expect(response.status).toBe(404);
  });

  describe('GET /api/tenants/:tenantId/whatsapp-sessions (M2, Fase 1 — lista)', () => {
    it('responde 200 com lista vazia quando o tenant não tem sessões', async () => {
      const app = buildApp();

      const response = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ sessions: [] });
    });

    it('responde 200 com as sessões do tenant depois de conectar', async () => {
      const app = buildApp();
      await request(app)
        .post('/api/tenants/tenant-1/whatsapp-sessions')
        .send({ sessionName: 'vendas' });

      const response = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions');

      expect(response.status).toBe(200);
      expect(response.body.sessions).toHaveLength(1);
      expect(response.body.sessions[0]).toMatchObject({
        tenantId: 'tenant-1',
        sessionName: 'vendas',
      });
    });

    it('isola tenants: lista de tenant-2 não inclui sessão criada para tenant-1', async () => {
      const app = buildApp();
      await request(app)
        .post('/api/tenants/tenant-1/whatsapp-sessions')
        .send({ sessionName: 'vendas' });

      const response = await request(app).get('/api/tenants/tenant-2/whatsapp-sessions');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ sessions: [] });
    });

    it('responde 400 quando tenantId no path é só espaço em branco', async () => {
      const app = buildApp();

      const response = await request(app).get('/api/tenants/%20%20/whatsapp-sessions');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_params');
    });
  });

  describe('DELETE /api/tenants/:tenantId/whatsapp-sessions/:sessionName/remove (M2, Fase 1)', () => {
    it('responde 204, inclusive para sessão nunca conectada (idempotente)', async () => {
      const app = buildApp();

      const response = await request(app).delete(
        '/api/tenants/tenant-1/whatsapp-sessions/nunca-existiu/remove',
      );

      expect(response.status).toBe(204);
    });

    it('remove de fato: sessão some da listagem e de GET /:sessionName depois de removida', async () => {
      const app = buildApp();
      await request(app)
        .post('/api/tenants/tenant-1/whatsapp-sessions')
        .send({ sessionName: 'vendas' });

      const removeResponse = await request(app).delete(
        '/api/tenants/tenant-1/whatsapp-sessions/vendas/remove',
      );
      const listResponse = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions');

      expect(removeResponse.status).toBe(204);
      expect(listResponse.body).toEqual({ sessions: [] });
    });

    it('não afeta a contrato de DELETE /:sessionName (desconectar) — continua respondendo 204 sem remover o registro', async () => {
      const app = buildApp();
      await request(app)
        .post('/api/tenants/tenant-1/whatsapp-sessions')
        .send({ sessionName: 'vendas' });

      const disconnectResponse = await request(app).delete(
        '/api/tenants/tenant-1/whatsapp-sessions/vendas',
      );
      const listResponse = await request(app).get('/api/tenants/tenant-1/whatsapp-sessions');

      expect(disconnectResponse.status).toBe(204);
      // Desconectar (não remover) preserva o registro da sessão — só muda o
      // status para 'disconnected'. Continua aparecendo na listagem.
      expect(listResponse.body.sessions).toHaveLength(1);
    });
  });

  describe('GET /api/tenants/:tenantId/whatsapp-sessions/:sessionName/history (M2, Fase 2)', () => {
    it('responde 200 com lista vazia quando a sessão nunca teve nenhuma transição registrada', async () => {
      const app = buildApp();

      const response = await request(app).get(
        '/api/tenants/tenant-1/whatsapp-sessions/nunca-existiu/history',
      );

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ events: [] });
    });

    it('responde 200 com os eventos gravados, do mais novo para o mais antigo', async () => {
      const { app, eventRepo } = buildAppWithEventRepo();
      await eventRepo.append({
        tenantId: 'tenant-1',
        sessionName: 'vendas',
        status: 'connecting',
        occurredAt: new Date('2026-07-09T10:00:00Z'),
      });
      await eventRepo.append({
        tenantId: 'tenant-1',
        sessionName: 'vendas',
        status: 'disconnected',
        disconnectReason: 'timed_out',
        occurredAt: new Date('2026-07-09T10:05:00Z'),
      });

      const response = await request(app).get(
        '/api/tenants/tenant-1/whatsapp-sessions/vendas/history',
      );

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(2);
      expect(response.body.events[0]).toMatchObject({
        status: 'disconnected',
        disconnectReason: 'timed_out',
      });
      expect(response.body.events[1]).toMatchObject({ status: 'connecting' });
    });

    it('respeita ?limit= na query string', async () => {
      const { app, eventRepo } = buildAppWithEventRepo();
      await eventRepo.append({
        tenantId: 'tenant-1',
        sessionName: 'vendas',
        status: 'connecting',
        occurredAt: new Date('2026-07-09T10:00:00Z'),
      });
      await eventRepo.append({
        tenantId: 'tenant-1',
        sessionName: 'vendas',
        status: 'disconnected',
        occurredAt: new Date('2026-07-09T10:05:00Z'),
      });

      const response = await request(app).get(
        '/api/tenants/tenant-1/whatsapp-sessions/vendas/history?limit=1',
      );

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(1);
    });

    it('responde 400 quando ?limit= não é um inteiro positivo', async () => {
      const app = buildApp();

      const response = await request(app).get(
        '/api/tenants/tenant-1/whatsapp-sessions/vendas/history?limit=abc',
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_params');
    });

    it('sobrevive à remoção da sessão: histórico continua consultável depois de DELETE /:sessionName/remove', async () => {
      const { app, eventRepo } = buildAppWithEventRepo();
      await eventRepo.append({
        tenantId: 'tenant-1',
        sessionName: 'vendas',
        status: 'connecting',
        occurredAt: new Date(),
      });
      await request(app)
        .post('/api/tenants/tenant-1/whatsapp-sessions')
        .send({ sessionName: 'vendas' });

      await request(app).delete('/api/tenants/tenant-1/whatsapp-sessions/vendas/remove');
      const response = await request(app).get(
        '/api/tenants/tenant-1/whatsapp-sessions/vendas/history',
      );

      expect(response.status).toBe(200);
      expect(response.body.events).toHaveLength(1);
    });
  });
});
