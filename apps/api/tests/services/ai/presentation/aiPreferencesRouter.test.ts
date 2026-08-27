import express from 'express';
import request from 'supertest';

import { createAiPreferencesRouter } from '../../../../src/services/ai/presentation/aiPreferencesRouter';
import { createAiPreferencesErrorHandler } from '../../../../src/services/ai/presentation/aiPreferencesErrorHandler';
import {
  AiPreferencesService,
  MAX_TOPICS_TO_AVOID_LENGTH,
  MAX_CUSTOM_HANDOFF_MESSAGE_LENGTH,
} from '../../../../src/services/ai/application/AiPreferencesService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeAiPreferencesRepository } from '../infrastructure/FakeAiPreferencesRepository';

/**
 * Testes do aiPreferencesRouter (Cérebro da IA v3, Fase 3) — mesmo padrão
 * exato de `aiProfileRouter.test.ts` (RBAC reaproveitando
 * ai_profile:read/update, mount aninhado por sessão, Principal injetado).
 */
const SESSION = 'sessao-1';

function buildApp(principal?: Principal): {
  app: express.Express;
  preferences: FakeAiPreferencesRepository;
} {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const preferences = new FakeAiPreferencesRepository();
  const service = new AiPreferencesService(preferences, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/ai-preferences',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createAiPreferencesRouter(service),
  );
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/ai-preferences',
    createAiPreferencesErrorHandler(new NoopLogger()),
  );
  return { app, preferences };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function path(tenantId: string, sessionName = SESSION): string {
  return `/api/tenants/${tenantId}/sessions/${sessionName}/ai-preferences`;
}

describe('aiPreferencesRouter (Cérebro da IA v3, Fase 3)', () => {
  describe('GET / (ai_profile:read)', () => {
    it('administrator lê: devolve preferences null quando não configurado (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ preferences: null });
    });

    it('devolve as preferences existentes (200)', async () => {
      const { app, preferences } = buildApp(person('owner'));
      preferences.seed('tenant-1', SESSION, {
        autonomyLevel: 'autonomous',
        maxDiscountPercent: 10,
      });

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body.preferences.autonomyLevel).toBe('autonomous');
      expect(response.body.preferences.maxDiscountPercent).toBe(10);
    });

    it('não mistura preferências de sessões diferentes do mesmo tenant', async () => {
      const { app, preferences } = buildApp(person('owner'));
      preferences.seed('tenant-1', SESSION, { autonomyLevel: 'conservative' });
      preferences.seed('tenant-1', 'sessao-2', { autonomyLevel: 'autonomous' });

      const response = await request(app).get(path('tenant-1', 'sessao-2'));

      expect(response.status).toBe(200);
      expect(response.body.preferences.autonomyLevel).toBe('autonomous');
    });

    it('operator NÃO pode ler (403 — sem ai_profile:read)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(403);
    });

    it('plano máquina lê normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(200);
    });
  });

  describe('PUT / (ai_profile:update)', () => {
    it('administrator salva e recebe as preferences persistidas (200)', async () => {
      const { app, preferences } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ autonomyLevel: 'autonomous', maxDiscountPercent: 15 });

      expect(response.status).toBe(200);
      expect(response.body.preferences.autonomyLevel).toBe('autonomous');
      expect(response.body.preferences.maxDiscountPercent).toBe(15);
      expect(await preferences.findByTenantAndSession('tenant-1', SESSION)).not.toBeNull();
    });

    it('aceita corpo vazio (nenhum campo muda) (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).put(path('tenant-1')).send({});

      expect(response.status).toBe(200);
      expect(response.body.preferences.autonomyLevel).toBe('balanced');
    });

    it('null explícito limpa maxDiscountPercent já configurado (200)', async () => {
      const { app } = buildApp(person('administrator'));
      await request(app).put(path('tenant-1')).send({ maxDiscountPercent: 20 });

      const response = await request(app).put(path('tenant-1')).send({ maxDiscountPercent: null });

      expect(response.status).toBe(200);
      expect(response.body.preferences.maxDiscountPercent).toBeNull();
    });

    it('rejeita autonomyLevel fora do enum (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ autonomyLevel: 'muito-autonomo' });

      expect(response.status).toBe(400);
    });

    it('rejeita maxDiscountPercent fora do range 0-100 (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).put(path('tenant-1')).send({ maxDiscountPercent: 101 });

      expect(response.status).toBe(400);
    });

    it('rejeita escalateAfterAttempts menor que 1 (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).put(path('tenant-1')).send({ escalateAfterAttempts: 0 });

      expect(response.status).toBe(400);
    });

    it('rejeita topicsToAvoid acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ topicsToAvoid: 'x'.repeat(MAX_TOPICS_TO_AVOID_LENGTH + 1) });

      expect(response.status).toBe(400);
    });

    it('rejeita customHandoffMessage acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ customHandoffMessage: 'x'.repeat(MAX_CUSTOM_HANDOFF_MESSAGE_LENGTH + 1) });

      expect(response.status).toBe(400);
    });

    it('manager NÃO pode salvar (403 — sem ai_profile:update)', async () => {
      const { app } = buildApp(person('manager'));

      const response = await request(app).put(path('tenant-1')).send({ autonomyLevel: 'balanced' });

      expect(response.status).toBe(403);
    });

    it('plano máquina salva normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).put(path('tenant-1')).send({ autonomyLevel: 'balanced' });

      expect(response.status).toBe(200);
    });
  });

  it('tenant inexistente devolve 404 (tenant_not_found)', async () => {
    const { app } = buildApp(person('administrator'));

    const response = await request(app).get(path('tenant-999'));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('tenant_not_found');
  });
});
