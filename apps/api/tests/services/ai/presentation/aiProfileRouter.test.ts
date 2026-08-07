import express from 'express';
import request from 'supertest';

import { createAiProfileRouter } from '../../../../src/services/ai/presentation/aiProfileRouter';
import { createAiProfileErrorHandler } from '../../../../src/services/ai/presentation/aiProfileErrorHandler';
import {
  AiBusinessProfileService,
  MAX_PROFILE_CONTENT_LENGTH,
} from '../../../../src/services/ai/application/AiBusinessProfileService';
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
 *
 * Mount ANINHADO por sessão (M6H-3, 2026-07-25):
 * `/api/tenants/:tenantId/sessions/:sessionName/ai-profile` — mesmo padrão de
 * `whatsAppSessionsRouter`.
 */
const SESSION = 'sessao-1';

function buildApp(principal?: Principal): {
  app: express.Express;
  profiles: FakeAiBusinessProfileRepository;
} {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const profiles = new FakeAiBusinessProfileRepository();
  const service = new AiBusinessProfileService(profiles, tenantRepository, new NoopLogger());

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/ai-profile',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createAiProfileRouter(service),
  );
  app.use(
    '/api/tenants/:tenantId/sessions/:sessionName/ai-profile',
    createAiProfileErrorHandler(new NoopLogger()),
  );
  return { app, profiles };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function path(tenantId: string, sessionName = SESSION): string {
  return `/api/tenants/${tenantId}/sessions/${sessionName}/ai-profile`;
}

describe('aiProfileRouter (Base de Conhecimento — Nível 1, por sessão desde M6H-3)', () => {
  describe('GET / (ai_profile:read)', () => {
    it('administrator lê: devolve profile null quando não configurado (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ profile: null });
    });

    it('devolve o profile existente com content e updatedAt (200)', async () => {
      const { app, profiles } = buildApp(person('owner'));
      profiles.seed('tenant-1', SESSION, 'Salão da Maria. Corte R$ 50.');

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body.profile.content).toBe('Salão da Maria. Corte R$ 50.');
      expect(typeof response.body.profile.updatedAt).toBe('string');
    });

    it('não mistura perfis de sessões diferentes do mesmo tenant', async () => {
      const { app, profiles } = buildApp(person('owner'));
      profiles.seed('tenant-1', SESSION, 'Perfil da sessão 1.');
      profiles.seed('tenant-1', 'sessao-2', 'Perfil da sessão 2.');

      const response = await request(app).get(path('tenant-1', 'sessao-2'));

      expect(response.status).toBe(200);
      expect(response.body.profile.content).toBe('Perfil da sessão 2.');
    });

    it('operator NÃO pode ler (403 — sem ai_profile:read)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(403);
    });

    it('plano máquina (chave da empresa) lê normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get(path('tenant-1'));

      expect(response.status).toBe(200);
    });
  });

  describe('PUT / (ai_profile:update)', () => {
    it('administrator salva o texto e recebe o profile persistido (200)', async () => {
      const { app, profiles } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ content: 'Barbearia do João. Corte R$ 40. Seg-sex 9h-19h.' });

      expect(response.status).toBe(200);
      expect(response.body.profile.content).toBe('Barbearia do João. Corte R$ 40. Seg-sex 9h-19h.');
      expect(await profiles.findByTenantAndSession('tenant-1', SESSION)).not.toBeNull();
    });

    it('aceita content vazio (apaga o "cérebro" — volta ao comportamento genérico) (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).put(path('tenant-1')).send({ content: '' });

      expect(response.status).toBe(200);
      expect(response.body.profile.content).toBe('');
    });

    it('rejeita content acima do teto de tamanho (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ content: 'x'.repeat(MAX_PROFILE_CONTENT_LENGTH + 1) });

      expect(response.status).toBe(400);
    });

    it('manager NÃO pode salvar (403 — sem ai_profile:update)', async () => {
      const { app } = buildApp(person('manager'));

      const response = await request(app).put(path('tenant-1')).send({ content: 'qualquer coisa' });

      expect(response.status).toBe(403);
    });

    it('plano máquina salva normalmente (200)', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).put(path('tenant-1')).send({ content: 'Loja X.' });

      expect(response.status).toBe(200);
    });

    // --- F1.8: campos de horário de atendimento ---

    it('F1.8: salva campos de horário e devolve os valores no profile (200)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).put(path('tenant-1')).send({
        content: 'Salão da Maria.',
        offHoursEnabled: true,
        workingHoursStart: '09:00',
        workingHoursEnd: '18:00',
        workingDays: 62,
        timezone: 'America/Sao_Paulo',
      });

      expect(response.status).toBe(200);
      expect(response.body.profile.offHoursEnabled).toBe(true);
      expect(response.body.profile.workingHoursStart).toBe('09:00');
      expect(response.body.profile.workingHoursEnd).toBe('18:00');
      expect(response.body.profile.workingDays).toBe(62);
      expect(response.body.profile.timezone).toBe('America/Sao_Paulo');
    });

    it('F1.8: rejeita formato de horário inválido (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ content: 'x', workingHoursStart: '9:00' }); // falta zero à esquerda

      expect(response.status).toBe(400);
    });

    it('F1.8: rejeita workingDays fora do range 0-127 (400)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .put(path('tenant-1'))
        .send({ content: 'x', workingDays: 128 });

      expect(response.status).toBe(400);
    });
  });

  it('tenant inexistente devolve 404 (tenant_not_found)', async () => {
    const { app } = buildApp(person('administrator'));

    const response = await request(app).get(path('tenant-999'));

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('tenant_not_found');
  });
});
