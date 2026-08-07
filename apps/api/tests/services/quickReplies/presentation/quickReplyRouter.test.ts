import express from 'express';
import request from 'supertest';

import { createQuickReplyRouter } from '../../../../src/services/quickReplies/presentation/quickReplyRouter';
import { createQuickReplyErrorHandler } from '../../../../src/services/quickReplies/presentation/quickReplyErrorHandler';
import {
  QuickReplyService,
  MAX_QUICK_REPLY_CONTENT_LENGTH,
} from '../../../../src/services/quickReplies/application/QuickReplyService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeQuickReplyRepository } from '../infrastructure/FakeQuickReplyRepository';

/**
 * Testes do quickReplyRouter (Fase 1, Bloco F1.9): thin router + RBAC por
 * rota (GET->quick_reply:read, POST/PUT/DELETE->quick_reply:manage) +
 * validação de forma + IDOR entre sessões/tenants. Principal INJETADO por
 * middleware (mesma técnica de aiProfileRouter.test) — o `authenticate` real
 * já é coberto em authenticate.test.
 *
 * Mount ANINHADO por sessão: `/api/tenants/:tenantId/sessions/:sessionName/quick-replies`.
 */
const SESSION = 'sessao-1';

function buildApp(principal?: Principal): {
  app: express.Express;
  quickReplies: FakeQuickReplyRepository;
} {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const quickReplies = new FakeQuickReplyRepository();
  const service = new QuickReplyService(quickReplies, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/quick-replies',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createQuickReplyRouter(service),
  );
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/quick-replies',
    createQuickReplyErrorHandler(new NoopLogger()),
  );
  return { app, quickReplies };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function basePath(tenantId: string, sessionName = SESSION): string {
  return `/api/tenants/${tenantId}/sessions/${sessionName}/quick-replies`;
}

describe('quickReplyRouter (Fase 1, Bloco F1.9)', () => {
  describe('GET / (quick_reply:read)', () => {
    it('operator lê: lista vazia quando a sessão não tem nenhuma resposta (200)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ quickReplies: [] });
    });

    it('devolve as respostas cadastradas', async () => {
      const { app, quickReplies } = buildApp(person('operator'));
      quickReplies.seed('tenant-1', SESSION, 'Bom dia! Como posso ajudar?');

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body.quickReplies).toHaveLength(1);
      expect(response.body.quickReplies[0].content).toBe('Bom dia! Como posso ajudar?');
    });

    it('não mistura respostas de sessões diferentes do mesmo tenant', async () => {
      const { app, quickReplies } = buildApp(person('operator'));
      quickReplies.seed('tenant-1', SESSION, 'Resposta da sessão 1.');
      quickReplies.seed('tenant-1', 'sessao-2', 'Resposta da sessão 2.');

      const response = await request(app).get(basePath('tenant-1', 'sessao-2'));

      expect(response.status).toBe(200);
      expect(response.body.quickReplies).toHaveLength(1);
      expect(response.body.quickReplies[0].content).toBe('Resposta da sessão 2.');
    });

    it('read_only NÃO pode ler (403 — sem quick_reply:read)', async () => {
      const { app } = buildApp(person('read_only'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(403);
    });

    it('plano máquina (chave da empresa) lê normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
    });
  });

  describe('POST / (quick_reply:manage)', () => {
    it('administrator cria e recebe a resposta persistida (201)', async () => {
      const { app, quickReplies } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ content: 'Obrigado pelo contato!' });

      expect(response.status).toBe(201);
      expect(response.body.quickReply.content).toBe('Obrigado pelo contato!');
      expect(await quickReplies.listBySession('tenant-1', SESSION)).toHaveLength(1);
    });

    it('rejeita content vazio (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).post(basePath('tenant-1')).send({ content: '' });

      expect(response.status).toBe(400);
    });

    it('rejeita content acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ content: 'x'.repeat(MAX_QUICK_REPLY_CONTENT_LENGTH + 1) });

      expect(response.status).toBe(400);
    });

    it('operator NÃO pode criar (403 — sem quick_reply:manage)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ content: 'qualquer coisa' });

      expect(response.status).toBe(403);
    });

    it('plano máquina cria normalmente (201)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).post(basePath('tenant-1')).send({ content: 'Loja X.' });

      expect(response.status).toBe(201);
    });
  });

  describe('PUT /:id (quick_reply:manage)', () => {
    it('administrator atualiza e recebe a resposta atualizada (200)', async () => {
      const { app, quickReplies } = buildApp(person('administrator'));
      const id = quickReplies.seed('tenant-1', SESSION, 'Texto antigo');

      const response = await request(app)
        .put(`${basePath('tenant-1')}/${id}`)
        .send({ content: 'Texto novo' });

      expect(response.status).toBe(200);
      expect(response.body.quickReply.content).toBe('Texto novo');
    });

    it('devolve 404 quando o id não existe', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(`${basePath('tenant-1')}/id-inexistente`)
        .send({ content: 'x' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('quick_reply_not_found');
    });

    it('devolve 404 quando o id existe mas é de outra sessão (IDOR-safe)', async () => {
      const { app, quickReplies } = buildApp(person('administrator'));
      const id = quickReplies.seed('tenant-1', 'outra-sessao', 'Texto de outra sessão');

      const response = await request(app)
        .put(`${basePath('tenant-1', SESSION)}/${id}`)
        .send({ content: 'x' });

      expect(response.status).toBe(404);
    });

    it('operator NÃO pode atualizar (403 — sem quick_reply:manage)', async () => {
      const { app, quickReplies } = buildApp(person('operator'));
      const id = quickReplies.seed('tenant-1', SESSION, 'Texto antigo');

      const response = await request(app)
        .put(`${basePath('tenant-1')}/${id}`)
        .send({ content: 'x' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /:id (quick_reply:manage)', () => {
    it('administrator remove (204)', async () => {
      const { app, quickReplies } = buildApp(person('administrator'));
      const id = quickReplies.seed('tenant-1', SESSION, 'Para remover');

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(204);
      expect(await quickReplies.listBySession('tenant-1', SESSION)).toEqual([]);
    });

    it('devolve 404 quando o id não existe', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).delete(`${basePath('tenant-1')}/id-inexistente`);

      expect(response.status).toBe(404);
    });

    it('devolve 404 quando o id existe mas é de outro tenant (IDOR-safe)', async () => {
      const { app, quickReplies } = buildApp(person('administrator'));
      const id = quickReplies.seed('tenant-2', SESSION, 'Texto de outro tenant');

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(404);
    });

    it('operator NÃO pode remover (403 — sem quick_reply:manage)', async () => {
      const { app, quickReplies } = buildApp(person('operator'));
      const id = quickReplies.seed('tenant-1', SESSION, 'Para remover');

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(403);
    });
  });

  it('tenant inexistente devolve 404 (tenant_not_found)', async () => {
    const { app } = buildApp(person('administrator'));

    const response = await request(app).get(basePath('tenant-999'));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('tenant_not_found');
  });
});
