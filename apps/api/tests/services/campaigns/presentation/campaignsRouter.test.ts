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
import { FakeAiProvider } from '../../ai/infrastructure/FakeAiProviderFactory';
import { GenerateLeadMessagesService } from '../../../../src/services/campaigns/application/GenerateLeadMessagesService';

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
  options: { withDispatcher?: boolean; withoutAiProvider?: boolean } = {},
): {
  app: express.Express;
  campaigns: FakeCampaignRepository;
  dispatcher?: FakeCampaignSendDispatcher;
  aiProvider: FakeAiProvider;
} {
  const tenantRepository = new FakeTenantRepository();
  tenantRepository.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  tenantRepository.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
  const campaigns = new FakeCampaignRepository();
  const dispatcher = options.withDispatcher ? new FakeCampaignSendDispatcher() : undefined;
  const service = new CampaignService(campaigns, tenantRepository, new NoopLogger(), dispatcher);
  const aiProvider = new FakeAiProvider();
  const generateLeadMessagesService = new GenerateLeadMessagesService(
    options.withoutAiProvider ? undefined : aiProvider,
  );

  const app = express();
  app.use(express.json());
  app.use(
    '/api/tenants/:tenantId/campaigns',
    (req, _res, next) => {
      if (principal) (req as RequestWithPrincipal).principal = principal;
      next();
    },
    createCampaignsRouter(service, generateLeadMessagesService),
  );
  app.use('/api/tenants/:tenantId/campaigns', createCampaignsErrorHandler(new NoopLogger()));
  return { app, campaigns, dispatcher, aiProvider };
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

    it('filtra por sessionName do lado do servidor', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'vendas', name: 'A' });
      campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'suporte', name: 'B' });

      const response = await request(app).get(`${basePath('tenant-1')}?sessionName=vendas`);

      expect(response.status).toBe(200);
      expect(response.body.campaigns).toHaveLength(1);
      expect(response.body.campaigns[0].name).toBe('A');
    });
  });

  describe('GET /overview (campaign:read, retrofit visual 2026-08-18)', () => {
    it('devolve a visão geral da sessão pedida (200)', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'vendas', status: 'running' });

      const response = await request(app).get(
        `${basePath('tenant-1')}/overview?sessionName=vendas`,
      );

      expect(response.status).toBe(200);
      expect(response.body.overview).toMatchObject({
        totalCampaigns: 1,
        statusCounts: { running: 1 },
      });
    });

    it('sem sessionName: 400', async () => {
      const { app } = buildApp(person('operator'));
      const response = await request(app).get(`${basePath('tenant-1')}/overview`);
      expect(response.status).toBe(400);
    });

    it('read_only NÃO pode consultar (403)', async () => {
      const { app } = buildApp(person('read_only'));
      const response = await request(app).get(
        `${basePath('tenant-1')}/overview?sessionName=vendas`,
      );
      expect(response.status).toBe(403);
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

    it('aceita personalizedMessage em phoneRecipients e repassa até o destinatário criado', async () => {
      const { app } = buildApp(person('administrator'));

      const created = await request(app)
        .post(basePath('tenant-1'))
        .send({
          sessionName: 'sessao-1',
          name: 'Prospecção IA — lote 1',
          messageTemplate: 'Template genérico',
          contactIds: [],
          phoneRecipients: [
            {
              rawPhone: '+55 21 98765-4321',
              name: 'Restaurante Exemplo',
              personalizedMessage: 'Mensagem única gerada pela IA para este lead.',
            },
          ],
        });

      expect(created.status).toBe(201);

      const recipients = await request(app).get(
        `${basePath('tenant-1')}/${created.body.campaign.id}/recipients`,
      );

      expect(recipients.status).toBe(200);
      expect(recipients.body.recipients[0].personalizedMessage).toBe(
        'Mensagem única gerada pela IA para este lead.',
      );
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

  describe('GET /:campaignId/metrics (Fase L, Bloco L7 — campaign:read)', () => {
    it('devolve as métricas calculadas', async () => {
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
        `${basePath('tenant-1')}/${created.body.campaign.id}/metrics`,
      );

      expect(response.status).toBe(200);
      expect(response.body.metrics).toMatchObject({ total: 1, pending: 1, replied: 0, skipped: 0 });
    });

    it('read_only NÃO pode ver métricas (403)', async () => {
      const { app, campaigns } = buildApp(person('read_only'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).get(`${basePath('tenant-1')}/${campaignId}/metrics`);

      expect(response.status).toBe(403);
    });

    it('404 para campanha inexistente', async () => {
      const { app } = buildApp(person('administrator'));

      const response = await request(app).get(`${basePath('tenant-1')}/campanha-fantasma/metrics`);

      expect(response.status).toBe(404);
    });

    it('IDOR: métricas de campanha de OUTRO tenant devolvem 404', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-2', sessionName: 'sessao' });

      const response = await request(app).get(`${basePath('tenant-1')}/${campaignId}/metrics`);

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

  describe('POST /:campaignId/reopen (campaign:manage, retrofit 2026-08-18)', () => {
    it('administrator reabre uma campanha COMPLETED com destinatário FAILED (200, volta a running)', async () => {
      const { app, campaigns, dispatcher } = buildApp(person('administrator'), {
        withDispatcher: true,
      });
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'completed',
      });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: 'contact-1',
        status: 'failed',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/reopen`);

      expect(response.status).toBe(200);
      expect(response.body.campaign.status).toBe('running');
      expect(dispatcher!.scheduled).toHaveLength(1);
    });

    it('administrator reabre uma campanha CANCELLED (200)', async () => {
      const { app, campaigns } = buildApp(person('administrator'), { withDispatcher: true });
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'cancelled',
      });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: 'contact-1',
        status: 'failed',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/reopen`);

      expect(response.status).toBe(200);
      expect(response.body.campaign.status).toBe('running');
    });

    it('operator NÃO pode reabrir (403)', async () => {
      const { app, campaigns } = buildApp(person('operator'), { withDispatcher: true });
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'completed',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/reopen`);

      expect(response.status).toBe(403);
    });

    it('campanha RUNNING: 400 (só completed/cancelled reabrem)', async () => {
      const { app, campaigns } = buildApp(person('administrator'), { withDispatcher: true });
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/reopen`);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_campaign_transition');
    });

    it('sem motor de envio configurado (modo degradado): 503', async () => {
      const { app, campaigns } = buildApp(person('administrator')); // sem withDispatcher
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'completed',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/reopen`);

      expect(response.status).toBe(503);
    });

    it('404 para campanha inexistente', async () => {
      const { app } = buildApp(person('administrator'), { withDispatcher: true });

      const response = await request(app).post(`${basePath('tenant-1')}/campanha-fantasma/reopen`);

      expect(response.status).toBe(404);
    });

    it('IDOR: campanha de OUTRO tenant devolve 404, não reabre', async () => {
      const { app, campaigns } = buildApp(person('administrator'), { withDispatcher: true });
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-2',
        sessionName: 'sessao',
        status: 'completed',
      });

      const response = await request(app).post(`${basePath('tenant-1')}/${campaignId}/reopen`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:campaignId (campaign:manage, retrofit visual 2026-08-18)', () => {
    it('administrator apaga uma campanha DRAFT (204)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${campaignId}`);

      expect(response.status).toBe(204);
      const getResponse = await request(app).get(`${basePath('tenant-1')}/${campaignId}`);
      expect(getResponse.status).toBe(404);
    });

    it('operator NÃO pode apagar (403)', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${campaignId}`);

      expect(response.status).toBe(403);
    });

    it('campanha RUNNING: 400 (precisa pausar/cancelar antes)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const response = await request(app).delete(`${basePath('tenant-1')}/${campaignId}`);

      expect(response.status).toBe(400);
    });

    it('404 para campanha inexistente', async () => {
      const { app } = buildApp(person('administrator'));
      const response = await request(app).delete(`${basePath('tenant-1')}/campanha-fantasma`);
      expect(response.status).toBe(404);
    });

    it('IDOR: campanha de OUTRO tenant devolve 404, não apaga', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-2', sessionName: 'sessao' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${campaignId}`);

      expect(response.status).toBe(404);
    });
  });

  // --- Fase L, Bloco L8 (mídia na campanha) ---

  describe('POST /:campaignId/media (campaign:manage)', () => {
    it('administrator anexa mídia a uma campanha DRAFT (200, Campaign devolvida com media)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${campaignId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .set('x-media-filename', 'promo.jpg')
        .send(Buffer.from('bytes-da-imagem'));

      expect(response.status).toBe(200);
      expect(response.body.campaign.media).toEqual({
        contentType: 'image',
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });
    });

    it('operator NÃO pode anexar mídia (403)', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${campaignId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(403);
    });

    it('sem x-media-content-type: 400', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${campaignId}/media`)
        .set('content-type', 'image/jpeg')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(400);
    });

    it('campanha RUNNING: 400 (só DRAFT pode ter mídia anexada/trocada)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${campaignId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(400);
    });

    it('IDOR: campanha de OUTRO tenant devolve 404, não anexa', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-2', sessionName: 'sessao' });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/${campaignId}/media`)
        .set('content-type', 'image/jpeg')
        .set('x-media-content-type', 'image')
        .send(Buffer.from('bytes'));

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /:campaignId/media (campaign:manage)', () => {
    it('administrator remove a mídia anexada (200, media volta a undefined)', async () => {
      const { app, campaigns } = buildApp(person('administrator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      await campaigns.attachMedia('tenant-1', campaignId, {
        contentType: 'image',
        buffer: Buffer.from('bytes'),
        mimeType: 'image/jpeg',
      });

      const response = await request(app).delete(`${basePath('tenant-1')}/${campaignId}/media`);

      expect(response.status).toBe(200);
      expect(response.body.campaign.media).toBeUndefined();
    });

    it('operator NÃO pode remover mídia (403)', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).delete(`${basePath('tenant-1')}/${campaignId}/media`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /:campaignId/media (campaign:read)', () => {
    it('operator lê o binário anexado (200, Content-Type do arquivo)', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      await campaigns.attachMedia('tenant-1', campaignId, {
        contentType: 'image',
        buffer: Buffer.from('bytes-da-imagem'),
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });

      const response = await request(app).get(`${basePath('tenant-1')}/${campaignId}/media`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.body).toEqual(Buffer.from('bytes-da-imagem'));
    });

    it('campanha sem mídia: 404', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const response = await request(app).get(`${basePath('tenant-1')}/${campaignId}/media`);

      expect(response.status).toBe(404);
    });

    it('IDOR: campanha de OUTRO tenant devolve 404', async () => {
      const { app, campaigns } = buildApp(person('operator'));
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-2', sessionName: 'sessao' });
      await campaigns.attachMedia('tenant-2', campaignId, {
        contentType: 'image',
        buffer: Buffer.from('bytes'),
        mimeType: 'image/jpeg',
      });

      const response = await request(app).get(`${basePath('tenant-1')}/${campaignId}/media`);

      expect(response.status).toBe(404);
    });
  });

  // --- Fase de Prospecção IA (2026-08-29) ---

  describe('POST /leads/parse-csv (campaign:manage)', () => {
    it('devolve leads + inválidos, sem persistir nada', async () => {
      const { app } = buildApp(person('administrator'));
      const csv = [
        'Nome da Empresa,Categoria,Bairro,Status do Site,Nota Google,Qtd Avaliações,Dor Principal Identificada,Gatilho de Prova Social,Tom Recomendado,Ganchos de Abertura,CTA Recomendado,Telefone',
        'Adega Barril do Recreio,Restaurante português,Recreio dos Bandeirantes,Sem Site,4.3,3096,Dor qualquer.,Gatilho qualquer.,Tom qualquer.,Gancho único,CTA qualquer.,+55 21 2437-4428',
      ].join('\n');

      const response = await request(app)
        .post(`${basePath('tenant-1')}/leads/parse-csv`)
        .set('Content-Type', 'text/plain')
        .send(csv);

      expect(response.status).toBe(200);
      expect(response.body.leads).toHaveLength(1);
      expect(response.body.leads[0].companyName).toBe('Adega Barril do Recreio');
    });
  });

  describe('POST /leads/generate-messages (campaign:manage)', () => {
    it('devolve um rascunho por lead, sem criar campanha', async () => {
      const { app, aiProvider } = buildApp(person('administrator'));
      aiProvider.setNextResult({
        content: 'Mensagem gerada para teste.',
        model: 'fake-model',
        tokensInput: 5,
        tokensOutput: 10,
      });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/leads/generate-messages`)
        .send({
          leads: [
            {
              companyName: 'Adega Barril do Recreio',
              category: 'Restaurante português',
              neighborhood: 'Recreio dos Bandeirantes',
              siteStatus: 'Sem Site',
              googleRating: 4.3,
              reviewCount: 3096,
              mainPainPoint: 'Dor qualquer.',
              socialProofTrigger: 'Gatilho qualquer.',
              recommendedTone: 'Tom qualquer.',
              openingHooks: ['Gancho único'],
              recommendedCta: 'CTA qualquer.',
              rawPhone: '+55 21 2437-4428',
            },
          ],
        });

      expect(response.status).toBe(200);
      expect(response.body.drafts).toHaveLength(1);
      expect(response.body.drafts[0].message).toBe('Mensagem gerada para teste.');
    });

    it('sem AiProvider configurado (modo degradado): 503', async () => {
      const { app } = buildApp(person('administrator'), { withoutAiProvider: true });

      const response = await request(app)
        .post(`${basePath('tenant-1')}/leads/generate-messages`)
        .send({
          leads: [
            {
              companyName: 'Adega Barril do Recreio',
              category: 'Restaurante português',
              neighborhood: 'Recreio dos Bandeirantes',
              siteStatus: 'Sem Site',
              reviewCount: 0,
              mainPainPoint: 'Dor qualquer.',
              recommendedTone: 'Tom qualquer.',
              openingHooks: ['Gancho único'],
              recommendedCta: 'CTA qualquer.',
              rawPhone: '+55 21 2437-4428',
            },
          ],
        });

      expect(response.status).toBe(503);
      expect(response.body.error).toBe('lead_message_generation_unavailable');
    });
  });
});
