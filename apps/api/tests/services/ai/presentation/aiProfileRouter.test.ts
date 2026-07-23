import express from 'express';
import request from 'supertest';

import { createAiProfileRouter } from '../../../../src/services/ai/presentation/aiProfileRouter';
import { createAiProfileErrorHandler } from '../../../../src/services/ai/presentation/aiProfileErrorHandler';
import { AiBusinessProfileService, MAX_PROFILE_CONTENT_LENGTH } from '../../../../src/services/ai/application/AiBusinessProfileService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAiBusinessProfileRepository } from '../infrastructure/FakeAiBusinessProfileRepository';

/**
 * Testes do aiProfileRouter (Base de Conhecimento, Nível 1): thin router +
 * RBAC por rota (GET->ai_profile:read, PUT->ai_profile:update) + validação de
 * tamanho + mapeamento de TenantNotFoundError. Principal INJETADO por
 * middleware (mesma técnica de usersRouter.test) — o `authenticate` real já é
 * coberto em authenticate.test.
 */
function buildApp(principal?: Principal): { app: express.Express; profiles: FakeAiBusinessProfileRepository } {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const profiles = new FakeAiBusinessProfileRepository();
  const service = new AiBusinessProfileService(profiles, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/ai-profile',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createAiProfileRouter(service),
  );
  app.use('/api/tenants/:tenantId/ai-profile', createAiProfileErrorHandler(new NoopLogger()));
  return { app, profiles };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

describe('aiProfileRouter (Base de Conhecimento — Nível 1)', () => {
  describe('GET / (ai_profile:read)', () => {
    it('administrator lê: devolve profile null quando não configurado (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).get('/api/tenants/tenant-1/ai-profile');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ profile: null });
    });

    it('devolve o profile existente com content e updatedAt (200)', async () => {
      const { app, profiles } = buildApp(person('owner'));
      profiles.seed('tenant-1', 'Salão da Maria. Corte R$ 50.');

      const response = await request(app).get('/api/tenants/tenant-1/ai-profile');

      expect(response.status).toBe(200);
      expect(response.body.profile.content).toBe('Salão da Maria. Corte R$ 50.');
      expect(typeof response.body.profile.updatedAt).toBe('string');
    });

    it('operator NÃO pode ler (403 — sem ai_profile:read)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get('/api/tenants/tenant-1/ai-profile');

      expect(response.status).toBe(403);
    });

    it('plano máquina (chave da empresa) lê normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get('/api/tenants/tenant-1/ai-profile');

      expect(response.status).toBe(200);
    });
  });

  describe('PUT / (ai_profile:update)', () => {
    it('administrator salva o texto e recebe o profile persistido (200)', async () => {
      const { app, profiles } = buildApp(person('administrator'));

      const response = await request(app)
        .put('/api/tenants/tenant-1/ai-profile')
        .send({ content: 'Barbearia do João. Corte R$ 40. Seg-sex 9h-19h.' });

      expect(response.status).toBe(200);
      expect(response.body.profile.content).toBe('Barbearia do João. Corte R$ 40. Seg-sex 9h-19h.');
      expect(await profiles.findByTenant('tenant-1')).not.toBeNull();
    });

    it('aceita content vazio (apaga o "cérebro" — volta ao comportamento genérico) (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).put('/api/tenants/tenant-1/ai-profile').send({ content: '' });

      expect(response.status).toBe(200);
      expect(response.body.profile.content).toBe('');
    });

    it('rejeita content acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put('/api/tenants/tenant-1/ai-profile')
        .send({ content: 'x'.repeat(MAX_PROFILE_CONTENT_LENGTH + 1) });

      expect(response.status).toBe(400);
    });

    it('manager NÃO pode salvar (403 — sem ai_profile:update)', async () => {
      const { app } = buildApp(person('manager'));

      const response = await request(app).put('/api/tenants/tenant-1/ai-profile').send({ content: 'qualquer coisa' });

      expect(response.status).toBe(403);
    });

    it('plano máquina salva normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).put('/api/tenants/tenant-1/ai-profile').send({ content: 'Loja X.' });

      expect(response.status).toBe(200);
    });
  });

  it('tenant inexistente devolve 404 (tenant_not_found)', async () => {
    const { app } = buildApp(person('administrator'));

    const response = await request(app).get('/api/tenants/tenant-999/ai-profile');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('tenant_not_found');
  });
});
