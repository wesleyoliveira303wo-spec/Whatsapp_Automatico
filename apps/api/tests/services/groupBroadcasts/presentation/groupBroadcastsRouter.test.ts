import express from 'express';
import request from 'supertest';

import { createGroupBroadcastsRouter } from '../../../../src/services/groupBroadcasts/presentation/groupBroadcastsRouter';
import { createGroupBroadcastsErrorHandler } from '../../../../src/services/groupBroadcasts/presentation/groupBroadcastsErrorHandler';
import { GroupBroadcastService } from '../../../../src/services/groupBroadcasts/application/GroupBroadcastService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import {
  FakeAuditLogRepository,
  FakeGroupBroadcastRepository,
  FakeGroupBroadcastSendDispatcher,
  FakeGroupDirectory,
} from '../fakes';
import { GroupDirectoryUnavailableError } from '../../../../src/services/groupBroadcasts/domain/errors/groupBroadcastErrors';

/**
 * Testes do `groupBroadcastsRouter` — Disparos em grupos (2026-09-11): RBAC
 * por rota (GET→`campaign:read`, escrita→`campaign:manage`) + IDOR entre
 * tenants. Mesmo padrão de `campaignsRouter.test.ts`.
 */
function buildApp(
  principal?: Principal,
  options: {
    withDispatcher?: boolean;
    tenant1Plan?: 'free' | 'pro' | 'enterprise';
  } = {},
): {
  app: express.Express;
  repository: FakeGroupBroadcastRepository;
  directory: FakeGroupDirectory;
  dispatcher?: FakeGroupBroadcastSendDispatcher;
  auditLog: FakeAuditLogRepository;
} {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({
    id: 'tenant-1',
    name: 'Empresa Um',
    apiKeyHash: 'hash',
    plan: options.tenant1Plan,
  });
  tenantRepository.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });

  const repository = new FakeGroupBroadcastRepository();
  const directory = new FakeGroupDirectory();
  const dispatcher = options.withDispatcher ? new FakeGroupBroadcastSendDispatcher() : undefined;
  const auditLog = new FakeAuditLogRepository();
  const service = new GroupBroadcastService(
    repository,
    tenantRepository,
    directory,
    new NoopLogger(),
    dispatcher,
    auditLog,
  );

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/group-broadcasts',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createGroupBroadcastsRouter(service),
  );
  app.use('/api/tenants/:tenantId/group-broadcasts', createGroupBroadcastsErrorHandler(new NoopLogger()));
  return { app, repository, directory, dispatcher, auditLog };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function basePath(tenantId: string): string {
  return `/api/tenants/${tenantId}/group-broadcasts`;
}

describe('groupBroadcastsRouter (Disparos em grupos, 2026-09-11)', () => {
  describe('GET / (campaign:read)', () => {
    it('operator lê: lista vazia quando não há disparo nenhum (200)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(`${basePath('tenant-1')}?sessionName=sessao`);

      expect(response.status).toBe(200);
      expect(response.body.broadcasts).toEqual([]);
    });

    it('read_only NÃO pode listar (403)', async () => {
      const { app } = buildApp(person('read_only'));

      const response = await request(app).get(`${basePath('tenant-1')}?sessionName=sessao`);

      expect(response.status).toBe(403);
    });

    it('plano máquina (API key) também pode listar', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get(`${basePath('tenant-1')}?sessionName=sessao`);

      expect(response.status).toBe(200);
    });

    it('sem sessionName: 400', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(400);
    });

    it('filtra por sessão + devolve o resumo por disparo', async () => {
      const { app, repository } = buildApp(person('operator'));
      repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'vendas' });
      repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'suporte' });

      const response = await request(app).get(`${basePath('tenant-1')}?sessionName=vendas`);

      expect(response.status).toBe(200);
      expect(response.body.broadcasts).toHaveLength(1);
      expect(response.body.broadcasts[0].summary).toEqual({
        total: 1,
        pending: 1,
        sent: 0,
        failed: 0,
        skipped: 0,
      });
    });
  });

  describe('POST / (campaign:manage)', () => {
    it('operator NÃO pode criar (403)', async () => {
      const { app, directory } = buildApp(person('operator'));
      directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: ['111@g.us'],
        });

      expect(response.status).toBe(403);
    });

    it('administrator cria o disparo e recebe o resumo (201)', async () => {
      const { app, directory } = buildApp(person('administrator'));
      directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi pessoal',
          groupJids: ['111@g.us'],
        });

      expect(response.status).toBe(201);
      expect(response.body.broadcast).toMatchObject({ name: 'Disparo', status: 'draft' });
      expect(response.body.summary).toEqual({ total: 1, pending: 1, sent: 0, failed: 0, skipped: 0 });
    });

    it('owner cria e suprime grupo "só admin" onde o número não é admin', async () => {
      const { app, directory } = buildApp(person('owner'));
      directory.entries = [
        { jid: '111@g.us', name: 'Grupo Admin', participantCount: 5, canSend: false },
      ];

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: ['111@g.us'],
        });

      expect(response.status).toBe(201);
      expect(response.body.summary).toEqual({ total: 1, pending: 0, sent: 0, failed: 0, skipped: 1 });
      expect(response.body.targets[0].skipReason).toBe('admin_only_group');
    });

    it('grupo que não está na lista ao vivo vira skipped/group_not_found', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: ['111@g.us'],
        });

      expect(response.status).toBe(201);
      expect(response.body.targets[0].skipReason).toBe('group_not_found');
    });

    it('sem groupJids: 400 (validação de corpo)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ sessionName: 'sessao', name: 'Disparo', messageTemplate: 'Oi', groupJids: [] });

      expect(response.status).toBe(400);
    });

    it('sem sessionName: 400', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: 'Disparo', messageTemplate: 'Oi', groupJids: ['111@g.us'] });

      expect(response.status).toBe(400);
    });

    it('groupJid que não termina em @g.us: 400 (não é um disparo 1:1 disfarçado)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: ['5511999999999@s.whatsapp.net'],
        });

      expect(response.status).toBe(400);
    });

    it('mais de 30 grupos: 400', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: Array.from({ length: 31 }, (_, i) => `${i}@g.us`),
        });

      expect(response.status).toBe(400);
    });

    it('WhatsApp desconectado: 409 whatsapp_not_connected', async () => {
      const { app, directory } = buildApp(person('administrator'));
      directory.nextError = new GroupDirectoryUnavailableError('not_connected');

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: ['111@g.us'],
        });

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('whatsapp_not_connected');
    });

    it('WhatsApp sem resposta a tempo: 504 groups_fetch_timeout', async () => {
      const { app, directory } = buildApp(person('administrator'));
      directory.nextError = new GroupDirectoryUnavailableError('timeout');

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: ['111@g.us'],
        });

      expect(response.status).toBe(504);
      expect(response.body.error).toBe('groups_fetch_timeout');
    });

    it('registra a criação na trilha de auditoria', async () => {
      const { app, directory, auditLog } = buildApp(person('administrator'));
      directory.entries = [{ jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true }];

      await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Disparo',
          messageTemplate: 'Oi',
          groupJids: ['111@g.us'],
        });

      expect(auditLog.entries).toHaveLength(1);
      expect(auditLog.entries[0].action).toBe('group_broadcast.created');
    });
  });

  describe('GET /:broadcastId (campaign:read)', () => {
    it('devolve o disparo, resumo e alvos', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).get(`${basePath('tenant-1')}/${broadcastId}`);

      expect(response.status).toBe(200);
      expect(response.body.broadcast.id).toBe(broadcastId);
      expect(response.body.targets).toHaveLength(1);
    });

    it('404 para disparo inexistente', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(`${basePath('tenant-1')}/fantasma`);

      expect(response.status).toBe(404);
    });

    it('IDOR: disparo de OUTRO tenant devolve 404', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-2' });

      const response = await request(app).get(`${basePath('tenant-1')}/${broadcastId}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:broadcastId (campaign:manage)', () => {
    it('administrator apaga um disparo DRAFT (204)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${broadcastId}`);

      expect(response.status).toBe(204);
      const getResponse = await request(app).get(`${basePath('tenant-1')}/${broadcastId}`);
      expect(getResponse.status).toBe(404);
    });

    it('operator NÃO pode apagar (403)', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${broadcastId}`);

      expect(response.status).toBe(403);
    });

    it('disparo RUNNING: 400 (pause ou cancele antes)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${broadcastId}`);

      expect(response.status).toBe(400);
    });

    it('IDOR: disparo de OUTRO tenant devolve 404, não apaga', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-2' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${broadcastId}`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:broadcastId/start (campaign:manage)', () => {
    it('operator NÃO pode iniciar (403)', async () => {
      const { app, repository } = buildApp(person('operator'), { withDispatcher: true });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/start`);

      expect(response.status).toBe(403);
    });

    it('administrator inicia um disparo DRAFT com alvos pendentes (200)', async () => {
      const { app, repository, dispatcher } = buildApp(person('administrator'), {
        withDispatcher: true,
      });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/start`);

      expect(response.status).toBe(200);
      expect(response.body.broadcast.status).toBe('running');
      expect(dispatcher!.scheduled).toHaveLength(1);
    });

    it('tenant no Plano Grátis: 403 group_broadcast_requires_paid_plan', async () => {
      const { app, repository } = buildApp(person('administrator'), {
        withDispatcher: true,
        tenant1Plan: 'free',
      });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/start`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('group_broadcast_requires_paid_plan');
    });

    it('sem motor de envio configurado (modo degradado): 503', async () => {
      const { app, repository } = buildApp(person('administrator')); // sem withDispatcher
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/start`);

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('sending_engine_not_configured');
    });

    it('outro disparo RUNNING nesta sessão não bloqueia (2026-09-12: sem trava por pedido do fundador)', async () => {
      const { app, repository } = buildApp(person('administrator'), { withDispatcher: true });
      repository.seedBroadcast({ tenantId: 'tenant-1', sessionName: 'sessao', status: 'running' });
      const { broadcastId } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/start`);

      expect(response.status).toBe(200);
      expect(response.body.broadcast.status).toBe('running');
    });

    it('disparo já RUNNING: 400 (transição inválida)', async () => {
      const { app, repository } = buildApp(person('administrator'), { withDispatcher: true });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/start`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_group_broadcast_transition');
    });

    it('404 para disparo inexistente', async () => {
      const { app } = buildApp(person('administrator'), { withDispatcher: true });

      const response = await request(app).post(`${basePath('tenant-1')}/fantasma/start`);

      expect(response.status).toBe(404);
    });

    it('registra o início na trilha de auditoria', async () => {
      const { app, repository, auditLog } = buildApp(person('administrator'), {
        withDispatcher: true,
      });
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      await request(app).post(`${basePath('tenant-1')}/${broadcastId}/start`);

      expect(auditLog.entries.map((e) => e.action)).toContain('group_broadcast.started');
    });
  });

  describe('POST /:broadcastId/pause (campaign:manage)', () => {
    it('administrator pausa um disparo RUNNING (200)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/pause`);

      expect(response.status).toBe(200);
      expect(response.body.broadcast.status).toBe('paused');
    });

    it('operator NÃO pode pausar (403)', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/pause`);

      expect(response.status).toBe(403);
    });

    it('disparo DRAFT: 400 (nunca foi iniciado)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/pause`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /:broadcastId/cancel (campaign:manage)', () => {
    it('administrator cancela um disparo RUNNING (200)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/cancel`);

      expect(response.status).toBe(200);
      expect(response.body.broadcast.status).toBe('cancelled');
    });

    it('operator NÃO pode cancelar (403)', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/cancel`);

      expect(response.status).toBe(403);
    });

    it('disparo já COMPLETED: 400 (terminal)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({
        tenantId: 'tenant-1',
        status: 'completed',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${broadcastId}/cancel`);

      expect(response.status).toBe(400);
    });
  });

  // --- Mídia (imagem/vídeo) ---

  describe('POST /:broadcastId/media (campaign:manage)', () => {
    it('administrator anexa mídia a um disparo DRAFT (200)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${broadcastId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .set('x-media-filename', 'promo.jpg')
        .send(Buffer.from('bytes-da-imagem'));

      expect(response.status).toBe(200);
      expect(response.body.broadcast.media).toEqual({
        contentType: 'image',
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });
    });

    it('operator NÃO pode anexar mídia (403)', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${broadcastId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(403);
    });

    it('sem x-media-content-type: 400', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${broadcastId}/media`)
        .set('content-type', 'image/jpeg')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(400);
    });

    it('corpo vazio: 400 empty_body', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${broadcastId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.alloc(0));

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('empty_body');
    });

    it('assinatura binária não bate com a categoria declarada: 400', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${broadcastId}/media`)
        .set('content-type', 'video/mp4')
        .set('x-media-content-type', 'video')
        // Assinatura de PNG, declarado como vídeo.
        .send(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('group_broadcast_media_type_mismatch');
    });

    it('disparo RUNNING: 400 (só DRAFT pode ter mídia anexada)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1', status: 'running' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${broadcastId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(400);
    });

    it('IDOR: disparo de OUTRO tenant devolve 404, não anexa', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-2' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${broadcastId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:broadcastId/media (campaign:manage)', () => {
    it('administrator remove a mídia anexada (200)', async () => {
      const { app, repository } = buildApp(person('administrator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      await repository.attachMedia('tenant-1', broadcastId, {
        contentType: 'image',
        buffer: Buffer.from('bytes'),
        mimeType: 'image/jpeg',
      });

      const response = await request(app).delete(`${basePath('tenant-1')}/${broadcastId}/media`);

      expect(response.status).toBe(200);
      expect(response.body.broadcast.media).toBeUndefined();
    });

    it('operator NÃO pode remover mídia (403)', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${broadcastId}/media`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /:broadcastId/media (campaign:read)', () => {
    it('operator lê o binário anexado (200, Content-Type do arquivo)', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });
      await repository.attachMedia('tenant-1', broadcastId, {
        contentType: 'image',
        buffer: Buffer.from('bytes-da-imagem'),
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });

      const response = await request(app).get(`${basePath('tenant-1')}/${broadcastId}/media`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.body).toEqual(Buffer.from('bytes-da-imagem'));
    });

    it('disparo sem mídia: 404', async () => {
      const { app, repository } = buildApp(person('operator'));
      const { broadcastId } = repository.seedBroadcast({ tenantId: 'tenant-1' });

      const response = await request(app).get(`${basePath('tenant-1')}/${broadcastId}/media`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST / — recorrência (2026-09-11)', () => {
    const grupo = { jid: '111@g.us', name: 'Grupo 1', participantCount: 5, canSend: true };
    const corpoBase = {
      sessionName: 'sessao',
      name: 'Disparo',
      messageTemplate: 'Oi',
      groupJids: ['111@g.us'],
    };

    it('aceita e persiste a configuração de repetição', async () => {
      const { app, directory } = buildApp(person('administrator'));
      directory.entries = [grupo];

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          ...corpoBase,
          recurrenceIntervalHours: 3,
          recurrenceMaxRuns: 4,
          sendWindowStart: '09:00',
          sendWindowEnd: '18:00',
        });

      expect(response.status).toBe(201);
      expect(response.body.broadcast).toMatchObject({
        recurrenceIntervalHours: 3,
        recurrenceMaxRuns: 4,
        sendWindowStart: '09:00',
        sendWindowEnd: '18:00',
        runsCompleted: 0,
      });
    });

    it('recusa intervalo fora da faixa, horário mal formatado e repetição única (400)', async () => {
      const { app, directory } = buildApp(person('administrator'));
      directory.entries = [grupo];

      const intervalo = await request(app)
        .post(basePath('tenant-1'))
        .send({ ...corpoBase, recurrenceIntervalHours: 48 });
      const horario = await request(app)
        .post(basePath('tenant-1'))
        .send({ ...corpoBase, recurrenceIntervalHours: 2, sendWindowStart: '9h' });
      const repeticoes = await request(app)
        .post(basePath('tenant-1'))
        .send({ ...corpoBase, recurrenceIntervalHours: 2, recurrenceMaxRuns: 1 });

      expect(intervalo.status).toBe(400);
      expect(horario.status).toBe(400);
      expect(repeticoes.status).toBe(400);
    });

    it('data de término no passado: 400 com motivo próprio', async () => {
      const { app, directory } = buildApp(person('administrator'));
      directory.entries = [grupo];

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          ...corpoBase,
          recurrenceIntervalHours: 2,
          recurrenceEndsAt: new Date(Date.now() - 60000).toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_recurrence');
    });
  });

});
