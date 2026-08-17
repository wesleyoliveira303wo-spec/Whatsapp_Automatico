import express from 'express';
import request from 'supertest';

import { createCampaignsRouter } from '../../../../src/services/campaigns/presentation/campaignsRouter';
import { createCampaignsErrorHandler } from '../../../../src/services/campaigns/presentation/campaignsErrorHandler';
import { CampaignService } from '../../../../src/services/campaigns/application/CampaignService';
import { Principal, RequestWithPrincipal } from '../../../../src/shared/presentation/authenticate';
import { UserRole } from '../../../../src/services/auth/domain/entities/User';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeCampaignRepository } from '../infrastructure/FakeCampaignRepository';
import { FakeCampaignSendDispatcher } from '../infrastructure/FakeCampaignSendDispatcher';

/**
 * Testes do campaignsRouter — Fase L, Blocos L3/L4: RBAC por rota
 * (GET->campaign:read, escrita->campaign:manage) + IDOR entre tenants.
 * Mount TENANT-WIDE, mesmo padrão de `contactsRouter.test.ts`.
 *
 * `withDispatcher` liga o motor de envio (L4) — omitido nos testes de L3
 * (criação/leitura), que não precisam dele.
 */
function buildApp(
  principal?: Principal,
  options: { withDispatcher?: boolean } = {},
): {
  app: express.Express;
  campaigns: FakeCampaignRepository;
  dispatcher?: FakeCampaignSendDispatcher;
} {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  tenantRepository.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
  const campaigns = new FakeCampaignRepository();
  const dispatcher = options.withDispatcher ? new FakeCampaignSendDispatcher() : undefined;
  const service = new CampaignService(campaigns, tenantRepository, new NoopLogger(), dispatcher);

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/campaigns',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createCampaignsRouter(service),
  );
  app.use('/api/tenants/:tenantId/campaigns', createCampaignsErrorHandler(new NoopLogger()));
  return { app, campaigns, dispatcher };
}

function person(role: UserRole): Principal {
  return { kind: 'user', userId: 'user-1', tenantId: 'tenant-1', role };
}
const MACHINE: Principal = { kind: 'machine', tenantId: 'tenant-1' };

function basePath(tenantId: string): string {
  return `/api/tenants/${tenantId}/campaigns`;
}

const neutral = {
  optedOut: false,
  hasActiveHumanConversation: false,
  recentlyContactedByCampaign: false,
};

describe('campaignsRouter (Fase L, Bloco L3)', () => {
  describe('GET / (campaign:read)', () => {
    it('operator lê: lista vazia quando o tenant não tem campanha nenhuma (200)', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ campaigns: [] });
    });

    it('read_only NÃO pode listar campanhas (403)', async () => {
      const { app } = buildApp(person('read_only'));

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(403);
    });

    it('plano máquina (API key) também pode listar', async () => {
      const { app } = buildApp(MACHINE);

      const response = await request(app).get(basePath('tenant-1'));

      expect(response.status).toBe(200);
    });
  });

  describe('POST / (campaign:manage)', () => {
    it('operator NÃO pode criar campanha (403) — só administrator+', async () => {
      const { app } = buildApp(person('operator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: ['c1'],
        });

      expect(response.status).toBe(403);
    });

    it('administrator cria a campanha e recebe o resumo (201)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      campaigns.seedEligibility('contact-1', neutral);

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao-principal',
          name: 'Promoção',
          messageTemplate: 'Olá {{nome}}',
          contactIds: ['contact-1'],
        });

      expect(response.status).toBe(201);
      expect(response.body.campaign).toMatchObject({ name: 'Promoção', status: 'draft' });
      expect(response.body.summary).toEqual({ total: 1, pending: 1, skipped: 0, skipReasons: {} });
    });

    it('owner cria e suprime opt-out com o motivo certo', async () => {
      const { app, campaigns } = buildApp(person('owner'));
      campaigns.seedEligibility('contact-1', { ...neutral, optedOut: true });

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: ['contact-1'],
        });

      expect(response.status).toBe(201);
      expect(response.body.summary).toEqual({
        total: 1,
        pending: 0,
        skipped: 1,
        skipReasons: { opt_out: 1 },
      });
    });

    it('sem contactIds: 400 (validação de corpo)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ sessionName: 'sessao', name: 'Campanha', messageTemplate: 'Oi', contactIds: [] });

      expect(response.status).toBe(400);
    });

    it('sem sessionName: 400 (validação de corpo)', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app)
        .post(basePath('tenant-1'))
        .send({ name: 'Campanha', messageTemplate: 'Oi', contactIds: ['contact-1'] });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /:campaignId (campaign:read)', () => {
    it('devolve a campanha e o resumo', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      campaigns.seedEligibility('contact-1', neutral);
      const created = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: ['contact-1'],
        });

      const response = await request(app).get(
        `${basePath('tenant-1')}/${created.body.campaign.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.campaign.id).toBe(created.body.campaign.id);
    });

    it('404 para campanha inexistente', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).get(`${basePath('tenant-1')}/campanha-fantasma`);

      expect(response.status).toBe(404);
    });

    it('IDOR: campanha de OUTRO tenant devolve 404, não os dados', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      campaigns.seedEligibility('contact-1', neutral);
      const created = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Campanha do tenant 1',
          messageTemplate: 'Oi',
          contactIds: ['contact-1'],
        });

      const response = await request(app).get(
        `${basePath('tenant-2')}/${created.body.campaign.id}`,
      );

      expect(response.status).toBe(404);
    });
  });

  describe('GET /:campaignId/recipients (campaign:read)', () => {
    it('lista os destinatários calculados, com o motivo de supressão', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      campaigns.seedEligibility('contact-1', neutral);
      campaigns.seedEligibility('contact-2', { ...neutral, optedOut: true });
      const created = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: ['contact-1', 'contact-2'],
        });

      const response = await request(app).get(
        `${basePath('tenant-1')}/${created.body.campaign.id}/recipients`,
      );

      expect(response.status).toBe(200);
      expect(response.body.recipients).toHaveLength(2);
      const skipped = response.body.recipients.find(
        (r: { status: string }) => r.status === 'skipped',
      );
      expect(skipped.skipReason).toBe('opt_out');
    });

    it('filtra por status', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      campaigns.seedEligibility('contact-1', neutral);
      campaigns.seedEligibility('contact-2', { ...neutral, optedOut: true });
      const created = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: ['contact-1', 'contact-2'],
        });

      const response = await request(app).get(
        `${basePath('tenant-1')}/${created.body.campaign.id}/recipients?status=skipped`,
      );

      expect(response.status).toBe(200);
      expect(response.body.recipients).toHaveLength(1);
    });

    it('404 para campanha inexistente', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).get(
        `${basePath('tenant-1')}/campanha-fantasma/recipients`,
      );

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:campaignId/start (Fase L, Bloco L4 — campaign:manage)', () => {
    it('operator NÃO pode iniciar (403)', async () => {
      const { app, campaigns } = buildApp(person('operator'), { withDispatcher: true });
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/start`);

      expect(response.status).toBe(403);
    });

    it('administrator inicia uma campanha DRAFT com destinatários pendentes (200)', async () => {
      const { app, campaigns, dispatcher } = buildApp(person('administrator'), {
        withDispatcher: true,
      });
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      campaigns.seedRecipient({ tenantId: 'tenant-1', campaignId, contactId: 'contact-1' });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/start`);

      expect(response.status).toBe(200);
      expect(response.body.campaign.status).toBe('running');
      expect(dispatcher!.scheduled).toHaveLength(1);
    });

    it('sem motor de envio configurado (modo degradado): 503', async () => {
      const { app, campaigns } = buildApp(person('administrator')); // sem withDispatcher
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/start`);

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('sending_engine_not_configured');
    });

    it('campanha já RUNNING: 400 (transição inválida)', async () => {
      const { app, campaigns } = buildApp(person('administrator'), { withDispatcher: true });
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/start`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_campaign_transition');
    });

    it('404 para campanha inexistente', async () => {
      const { app } = buildApp(person('administrator'), { withDispatcher: true });

      const response = await request(app).post(`${basePath('tenant-1')}/campanha-fantasma/start`);

      expect(response.status).toBe(404);
    });
  });

  describe('POST /:campaignId/pause (campaign:manage)', () => {
    it('administrator pausa uma campanha RUNNING (200)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/pause`);

      expect(response.status).toBe(200);
      expect(response.body.campaign.status).toBe('paused');
    });

    it('operator NÃO pode pausar (403)', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/pause`);

      expect(response.status).toBe(403);
    });

    it('campanha DRAFT: 400 (nunca foi iniciada)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/pause`);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /:campaignId/cancel (campaign:manage)', () => {
    it('administrator cancela uma campanha RUNNING (200)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/cancel`);

      expect(response.status).toBe(200);
      expect(response.body.campaign.status).toBe('cancelled');
    });

    it('operator NÃO pode cancelar (403)', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/cancel`);

      expect(response.status).toBe(403);
    });

    it('campanha já COMPLETED: 400 (terminal)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'completed',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/cancel`);

      expect(response.status).toBe(400);
    });
  });
});
