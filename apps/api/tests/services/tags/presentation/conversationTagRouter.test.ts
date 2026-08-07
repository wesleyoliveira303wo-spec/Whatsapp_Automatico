import express from 'express';
import request from 'supertest';

import { createConversationTagRouter } from '../../../../src/services/tags/presentation/conversationTagRouter';
import { createTagErrorHandler } from '../../../../src/services/tags/presentation/tagErrorHandler';
import { TagService } from '../../../../src/services/tags/application/TagService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeTagRepository } from '../infrastructure/FakeTagRepository';

/**
 * Testes do conversationTagRouter (Redesign 2026-08-05, R4): atribuição de
 * tags a uma conversa. RBAC `message:send` (operator+, mesma régua de mover
 * card no Pipeline, ADR #84) — distinta do CATÁLOGO (`tagRouter`, `tag:manage`,
 * administrator+). Mount FLAT: `/api/tenants/:tenantId/conversations/:conversationId/tags`.
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
    '/api/tenants/:tenantId/conversations/:conversationId/tags',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createConversationTagRouter(service),
  );
  app.use(
    '/api/tenants/:tenantId/conversations/:conversationId/tags',
    createTagErrorHandler(new NoopLogger()),
  );
  return { app, tags };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function basePath(tenantId: string, conversationId = 'conversation-1'): string {
  return `/api/tenants/${tenantId}/conversations/${conversationId}/tags`;
}

describe('conversationTagRouter (Redesign 2026-08-05, R4)', () => {
  describe('POST /:tagId (message:send)', () => {
    it('operator atribui a tag à conversa (204)', async () => {
      const { app, tags } = buildApp(person('operator'));
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      const response = await request(app).post(`${basePath('tenant-1')}/${tagId}`);

      expect(response.status).toBe(204);
      expect(tags.isAssigned('conversation-1', tagId)).toBe(true);
    });

    it('devolve 404 quando a conversa não pertence ao tenant (IDOR-safe)', async () => {
      const { app, tags } = buildApp(person('operator'));
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-2', SESSION);

      const response = await request(app).post(`${basePath('tenant-1')}/${tagId}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('tag_not_found');
    });

    it('devolve 404 quando a tag não existe/não é da mesma sessão da conversa', async () => {
      const { app, tags } = buildApp(person('operator'));
      const tagId = tags.seed('tenant-1', 'outra-sessao', 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      const response = await request(app).post(`${basePath('tenant-1')}/${tagId}`);

      expect(response.status).toBe(404);
    });

    it('read_only NÃO pode atribuir (403 — sem message:send)', async () => {
      const { app, tags } = buildApp(person('read_only'));
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      const response = await request(app).post(`${basePath('tenant-1')}/${tagId}`);

      expect(response.status).toBe(403);
    });

    it('plano máquina atribui normalmente (204)', async () => {
      const { app, tags } = buildApp(MACHINE);
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      const response = await request(app).post(`${basePath('tenant-1')}/${tagId}`);

      expect(response.status).toBe(204);
    });
  });

  describe('DELETE /:tagId (message:send)', () => {
    it('operator remove a atribuição (204)', async () => {
      const { app, tags } = buildApp(person('operator'));
      const tagId = tags.seed('tenant-1', SESSION, 'Urgente', 'red');
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);
      await request(app).post(`${basePath('tenant-1')}/${tagId}`);

      const response = await request(app).delete(`${basePath('tenant-1')}/${tagId}`);

      expect(response.status).toBe(204);
      expect(tags.isAssigned('conversation-1', tagId)).toBe(false);
    });

    it('é idempotente — remover uma atribuição inexistente ainda devolve 204', async () => {
      const { app, tags } = buildApp(person('operator'));
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      const response = await request(app).delete(`${basePath('tenant-1')}/tag-nunca-atribuida`);

      expect(response.status).toBe(204);
    });

    it('devolve 404 quando a conversa não pertence ao tenant (IDOR-safe)', async () => {
      const { app, tags } = buildApp(person('operator'));
      tags.seedConversation('conversation-1', 'tenant-2', SESSION);

      const response = await request(app).delete(`${basePath('tenant-1')}/tag-1`);

      expect(response.status).toBe(404);
    });

    it('read_only NÃO pode remover (403 — sem message:send)', async () => {
      const { app, tags } = buildApp(person('read_only'));
      tags.seedConversation('conversation-1', 'tenant-1', SESSION);

      const response = await request(app).delete(`${basePath('tenant-1')}/tag-1`);

      expect(response.status).toBe(403);
    });
  });

  it('tenant inexistente devolve 404 (tenant_not_found)', async () => {
    const { app } = buildApp(person('operator'));

    const response = await request(app).post(`${basePath('tenant-999')}/tag-1`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('tenant_not_found');
  });
});
