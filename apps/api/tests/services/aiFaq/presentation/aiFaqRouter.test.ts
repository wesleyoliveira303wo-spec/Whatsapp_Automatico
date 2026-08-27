import express from 'express';
import request from 'supertest';

import { createAiFaqRouter } from '../../../../src/services/aiFaq/presentation/aiFaqRouter';
import { createAiFaqErrorHandler } from '../../../../src/services/aiFaq/presentation/aiFaqErrorHandler';
import {
  AiFaqService,
  MAX_FAQ_QUESTION_LENGTH,
  MAX_FAQ_ANSWER_LENGTH,
} from '../../../../src/services/aiFaq/application/AiFaqService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAiFaqRepository } from '../infrastructure/FakeAiFaqRepository';

/**
 * Testes do aiFaqRouter (Cérebro da IA v3, Fase 2): thin router + RBAC por
 * rota (reaproveita ai_profile:read/ai_profile:update — mesmo nível de
 * administrator/owner de todo o Cérebro da IA) + validação de forma + IDOR
 * entre sessões/tenants. Principal INJETADO por middleware (mesma técnica de
 * quickReplyRouter.test).
 *
 * Mount ANINHADO por sessão: `/api/tenants/:tenantId/sessions/:sessionName/ai-faq`.
 */
const SESSION = 'sessao-1';

function buildApp(principal?: Principal): { app: express.Express; aiFaq: FakeAiFaqRepository } {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const aiFaq = new FakeAiFaqRepository();
  const service = new AiFaqService(aiFaq, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/ai-faq',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createAiFaqRouter(service),
  );
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/ai-faq',
    createAiFaqErrorHandler(new NoopLogger()),
  );
  return { app, aiFaq };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function basePath(tenantId: string, sessionName = SESSION): string {
  return `/api/tenants/${tenantId}/sessions/${sessionName}/ai-faq`;
}

describe('aiFaqRouter (Cérebro da IA v3, Fase 2)', () => {
  describe('GET / (ai_profile:read)', () => {
    it('administrator lê: lista vazia quando a sessão não tem nenhuma FAQ (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ faqEntries: [] });
    });

    it('devolve as FAQs cadastradas', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));
      aiFaq.seed('tenant-1', SESSION, 'Qual o preço?', 'R$ 990', { category: 'Preços' });

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body.faqEntries).toHaveLength(1);
      expect(response.body.faqEntries[0].question).toBe('Qual o preço?');
    });

    it('não mistura FAQs de sessões diferentes do mesmo tenant', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));
      aiFaq.seed('tenant-1', SESSION, 'Da sessão 1', 'R1');
      aiFaq.seed('tenant-1', 'sessao-2', 'Da sessão 2', 'R2');

      const response = await request(app).get(basePath('tenant-1', 'sessao-2'));

      expect(response.status).toBe(200);
      expect(response.body.faqEntries).toHaveLength(1);
      expect(response.body.faqEntries[0].question).toBe('Da sessão 2');
    });

    it('operator NÃO pode ler (403 — sem ai_profile:read)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(403);
    });

    it('manager NÃO pode ler (403 — sem ai_profile:read)', async () => {
      const { app } = buildApp(person('manager'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(403);
    });

    it('plano máquina (chave da empresa) lê normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
    });
  });

  describe('POST / (ai_profile:update)', () => {
    it('administrator cria e recebe a FAQ persistida (201)', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: 'Vocês entregam?', answer: 'Sim, entregamos.', category: 'Entrega' });

      expect(response.status).toBe(201);
      expect(response.body.faqEntry.question).toBe('Vocês entregam?');
      expect(response.body.faqEntry.active).toBe(true);
      expect(await aiFaq.listBySession('tenant-1', SESSION)).toHaveLength(1);
    });

    it('cria sem categoria (opcional)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: 'P', answer: 'R' });

      expect(response.status).toBe(201);
      expect(response.body.faqEntry.category).toBeNull();
    });

    it('rejeita question vazia (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: '', answer: 'R' });

      expect(response.status).toBe(400);
    });

    it('rejeita answer vazia (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: 'P', answer: '' });

      expect(response.status).toBe(400);
    });

    it('rejeita question acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: 'x'.repeat(MAX_FAQ_QUESTION_LENGTH + 1), answer: 'R' });

      expect(response.status).toBe(400);
    });

    it('rejeita answer acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: 'P', answer: 'x'.repeat(MAX_FAQ_ANSWER_LENGTH + 1) });

      expect(response.status).toBe(400);
    });

    it('operator NÃO pode criar (403 — sem ai_profile:update)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: 'P', answer: 'R' });

      expect(response.status).toBe(403);
    });

    it('plano máquina cria normalmente (201)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ question: 'P', answer: 'R' });

      expect(response.status).toBe(201);
    });
  });

  describe('PUT /:id (ai_profile:update)', () => {
    it('administrator atualiza e recebe a FAQ atualizada (200)', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));
      const id = aiFaq.seed('tenant-1', SESSION, 'Pergunta antiga', 'Resposta antiga');

      const response = await request(app)
        .put(`${basePath('tenant-1')}/${id}`)
        .send({ question: 'Pergunta nova' });

      expect(response.status).toBe(200);
      expect(response.body.faqEntry.question).toBe('Pergunta nova');
      expect(response.body.faqEntry.answer).toBe('Resposta antiga');
    });

    it('atualiza só o toggle active (desativar sem apagar)', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));
      const id = aiFaq.seed('tenant-1', SESSION, 'P', 'R');

      const response = await request(app)
        .put(`${basePath('tenant-1')}/${id}`)
        .send({ active: false });

      expect(response.status).toBe(200);
      expect(response.body.faqEntry.active).toBe(false);
    });

    it('devolve 404 quando o id não existe', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(`${basePath('tenant-1')}/id-inexistente`)
        .send({ active: false });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('ai_faq_entry_not_found');
    });

    it('devolve 404 quando o id existe mas é de outra sessão (IDOR-safe)', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));
      const id = aiFaq.seed('tenant-1', 'outra-sessao', 'P', 'R');

      const response = await request(app)
        .put(`${basePath('tenant-1', SESSION)}/${id}`)
        .send({ active: false });

      expect(response.status).toBe(404);
    });

    it('operator NÃO pode atualizar (403 — sem ai_profile:update)', async () => {
      const { app, aiFaq } = buildApp(person('operator'));
      const id = aiFaq.seed('tenant-1', SESSION, 'P', 'R');

      const response = await request(app)
        .put(`${basePath('tenant-1')}/${id}`)
        .send({ active: false });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /:id (ai_profile:update)', () => {
    it('administrator remove (204)', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));
      const id = aiFaq.seed('tenant-1', SESSION, 'P', 'R');

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(204);
      expect(await aiFaq.listBySession('tenant-1', SESSION)).toEqual([]);
    });

    it('devolve 404 quando o id não existe', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).delete(`${basePath('tenant-1')}/id-inexistente`);

      expect(response.status).toBe(404);
    });

    it('devolve 404 quando o id existe mas é de outro tenant (IDOR-safe)', async () => {
      const { app, aiFaq } = buildApp(person('administrator'));
      const id = aiFaq.seed('tenant-2', SESSION, 'P', 'R');

      const response = await request(app).delete(`${basePath('tenant-1')}/${id}`);

      expect(response.status).toBe(404);
    });

    it('operator NÃO pode remover (403 — sem ai_profile:update)', async () => {
      const { app, aiFaq } = buildApp(person('operator'));
      const id = aiFaq.seed('tenant-1', SESSION, 'P', 'R');

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
