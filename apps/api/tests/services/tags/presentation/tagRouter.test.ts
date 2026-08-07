import express from 'express';
import request from 'supertest';

import { createTagRouter } from '../../../../src/services/tags/presentation/tagRouter';
import { createTagErrorHandler } from '../../../../src/services/tags/presentation/tagErrorHandler';
import {
  TagService,
  MAX_TAG_NAME_LENGTH,
} from '../../../../src/services/tags/application/TagService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeTagRepository } from '../infrastructure/FakeTagRepository';

/**
 * Testes do tagRouter (Redesign 2026-08-05, R4): thin router + RBAC por rota
 * (GET->tag:read, POST/PUT/DELETE->tag:manage) + validação de forma + IDOR
 * entre sessões/tenants. Principal injetado por middleware (mesma técnica de
 * quickReplyRouter.test) — `authenticate` real já é coberto em authenticate.test.
 *
 * Mount ANINHADO por sessão: `/api/tenants/:tenantId/sessions/:sessionName/tags`.
 */
const SESSION = 'sessao-1';

function buildApp(principal?: Principal): { app: express.Express; tags: FakeTagRepository } {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const tags = new FakeTagRepository();
  const service = new TagService(tags, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/tags',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createTagRouter(service),
  );
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/tags',
    createTagErrorHandler(new NoopLogger()),
  );
  return { app, tags };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function basePath(tenantId: string, sessionName = SESSION): string {
  return `/api/tenants/${tenantId}/sessions/${sessionName}/tags`;
}

describe('tagRouter (Redesign 2026-08-05, R4)', () => {
  describe('GET / (tag:read)', () => {
    it('operator lê: lista vazia quando a sessão não tem nenhuma tag (200)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ tags: [] });
    });

    it('devolve as tags cadastradas', async () => {
      const { app, tags } = buildApp(person('operator'));
      tags.seed('tenant-1', SESSION, 'Urgente', 'red');

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body.tags).toHaveLength(1);
      expect(response.body.tags[0]).toMatchObject({ name: 'Urgente', color: 'red' });
    });

    it('não mistura tags de sessões diferentes do mesmo tenant', async () => {
      const { app, tags } = buildApp(person('operator'));
      tags.seed('tenant-1', SESSION, 'Sessão 1', 'blue');
      tags.seed('tenant-1', 'sessao-2', 'Sessão 2', 'green');

      const response = await request(app).get(basePath('tenant-1', 'sessao-2'));

      expect(response.status).toBe(200);
      expect(response.body.tags).toHaveLength(1);
      expect(response.body.tags[0].name).toBe('Sessão 2');
    });

    it('read_only NÃO pode ler (403 — sem tag:read)', async () => {
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

  describe('POST / (tag:manage)', () => {
    it('administrator cria e recebe a tag persistida (201)', async () => {
      const { app, tags } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: 'VIP', color: 'purple' });

      expect(response.status).toBe(201);
      expect(response.body.tag).toMatchObject({ name: 'VIP', color: 'purple' });
      expect(await tags.listBySession('tenant-1', SESSION)).toHaveLength(1);
    });

    it('rejeita name vazio (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: '', color: 'gray' });

      expect(response.status).toBe(400);
    });

    it('rejeita name acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: 'x'.repeat(MAX_TAG_NAME_LENGTH + 1), color: 'gray' });

      expect(response.status).toBe(400);
    });

    it('rejeita color fora da paleta fixa (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: 'VIP', color: 'magenta' });

      expect(response.status).toBe(400);
    });

    it('operator NÃO pode criar (403 — sem tag:manage)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: 'qualquer', color: 'gray' });

      expect(response.status).toBe(403);
    });

    it('plano máquina cria normalmente (201)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: 'Loja X', color: 'amber' });

      expect(response.status).toBe(201);
    });
  });

  describe('PUT /:id (tag:manage)', () => {
    it('administrator atualiza e recebe a tag atualizada (200)', async () => {
      const { app, tags } = buildApp(person('administrator'));
      const id = tags.seed('tenant-1', SESSION, 'Nome antigo', 'gray');

      const response = await request(app)
        .put(`${basePath('tenant-1')}/${id}`)
        .send({ name: 'Nome novo', color: 'teal' });

      expect(response.status).toBe(200);
      expect(response.body.tag).toMatchObject({ name: 'Nome novo', color: 'teal' });
    });

    it('devolve 404 quando o id não existe', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(`${basePath('tenant-1')}/id-inexistente`)
        .send({ name: 'x' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('tag_not_found');
    });

    it('devolve 404 quando o id existe mas é de outra sessão (IDOR-safe)', async () => {
      const { app, tags } = buildApp(person('administrator'));
      const id = tags.seed('tenant-1', 'outra-sessao', 'Tag de outra sessão', 'gray');

      const response = await request(app)
        .put(`${basePath('tenant-1', SESSION)}/${id}`)
        .send({ name: 'x' });

      expect(response.status).toBe(404);
    });

    it('operator NÃO pode atualizar (403 — sem tag:manage)', async () => {
      const { app, tags } = buildApp(person('operator'));
      const id = tags.seed('tenant-1', SESSION, 'Nome antigo', 'gray');

      const response = await request(app)
        .put(`${basePath('tenant-1')}/${id}`)
        .send({ name: 'x' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /:id (tag:manage)', () => {
    it('administrator remove (204)', async () => {
      const { app, tags } = buildApp(person('administrator'));
      const id = tags.seed('tenant-1', SESSION, 'Para remover', 'gray');

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(204);
      expect(await tags.listBySession('tenant-1', SESSION)).toEqual([]);
    });

    it('devolve 404 quando o id não existe', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).delete(`${basePath('tenant-1')}/id-inexistente`);

      expect(response.status).toBe(404);
    });

    it('devolve 404 quando o id existe mas é de outro tenant (IDOR-safe)', async () => {
      const { app, tags } = buildApp(person('administrator'));
      const id = tags.seed('tenant-2', SESSION, 'Tag de outro tenant', 'gray');

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(404);
    });

    it('operator NÃO pode remover (403 — sem tag:manage)', async () => {
      const { app, tags } = buildApp(person('operator'));
      const id = tags.seed('tenant-1', SESSION, 'Para remover', 'gray');

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
