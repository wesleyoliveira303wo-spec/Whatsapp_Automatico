import {
  CampaignService,
  MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES,
} from '../../../../src/services/campaigns/application/CampaignService';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { CampaignNotFoundError } from '../../../../src/services/campaigns/domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../../../../src/services/campaigns/domain/errors/NoRecipientsSelectedError';
import { InvalidCampaignTransitionError } from '../../../../src/services/campaigns/domain/errors/InvalidCampaignTransitionError';
import { SendingEngineNotConfiguredError } from '../../../../src/services/campaigns/domain/errors/SendingEngineNotConfiguredError';
import { CampaignMediaTooLargeError } from '../../../../src/services/campaigns/domain/errors/CampaignMediaTooLargeError';
import { CampaignMediaTypeMismatchError } from '../../../../src/services/campaigns/domain/errors/CampaignMediaTypeMismatchError';
import { CampaignMediaNotFoundError } from '../../../../src/services/campaigns/domain/errors/CampaignMediaNotFoundError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeCampaignRepository } from '../infrastructure/FakeCampaignRepository';
import { FakeCampaignSendDispatcher } from '../infrastructure/FakeCampaignSendDispatcher';
import { FakeContactLookup } from '../infrastructure/FakeContactLookup';

function buildSut(): {
  service: CampaignService;
  campaigns: FakeCampaignRepository;
  dispatcher: FakeCampaignSendDispatcher;
} {
  const tenants = new FakeTenantRepository();
  tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
  const campaigns = new FakeCampaignRepository();
  const dispatcher = new FakeCampaignSendDispatcher();
  const service = new CampaignService(campaigns, tenants, new NoopLogger(), dispatcher);
  return { service, campaigns, dispatcher };
}

const neutral = {
  optedOut: false,
  hasActiveHumanConversation: false,
  recentlyContactedByCampaign: false,
};

describe('CampaignService (Fase L, Bloco L3)', () => {
  describe('createCampaign()', () => {
    it('cria a campanha em DRAFT e materializa contatos elegíveis como pending', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', neutral);
      campaigns.seedEligibility('contact-2', neutral);

      const result = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Promoção de agosto',
        messageTemplate: 'Olá {{nome}}, temos uma novidade!',
        contactIds: ['contact-1', 'contact-2'],
      });

      expect(result.campaign).toMatchObject({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Promoção de agosto',
        status: 'draft',
      });
      expect(result.summary).toEqual({ total: 2, pending: 2, skipped: 0, skipReasons: {} });
    });

    it('suprime contato com opt-out e reporta o motivo', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', neutral);
      campaigns.seedEligibility('contact-2', { ...neutral, optedOut: true });

      const result = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1', 'contact-2'],
      });

      expect(result.summary).toEqual({
        total: 2,
        pending: 1,
        skipped: 1,
        skipReasons: { opt_out: 1 },
      });
    });

    it('suprime contato em conversa ativa com humano', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', { ...neutral, hasActiveHumanConversation: true });

      const result = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1'],
      });

      expect(result.summary).toEqual({
        total: 1,
        pending: 0,
        skipped: 1,
        skipReasons: { active_human_conversation: 1 },
      });
    });

    it('suprime contato contatado há menos de 7 dias por outra campanha', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', { ...neutral, recentlyContactedByCampaign: true });

      const result = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1'],
      });

      expect(result.summary.skipReasons).toEqual({ recently_contacted: 1 });
    });

    it('ignora um contactId sem elegibilidade resolvida (não existe/não pertence ao tenant)', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', neutral);
      // contact-fantasma nunca foi "seedado" — simula um contato inexistente.

      const result = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1', 'contact-fantasma'],
      });

      expect(result.summary.total).toBe(1);
    });

    it('deduplica contactIds repetidos na mesma requisição', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', neutral);

      const result = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1', 'contact-1'],
      });

      expect(result.summary.total).toBe(1);
    });

    it('lança NoRecipientsSelectedError com lista vazia', async () => {
      const { service } = buildSut();

      await expect(
        service.createCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao-principal',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: [],
        }),
      ).rejects.toThrow(NoRecipientsSelectedError);
    });

    it('lança TenantNotFoundError para tenant inexistente', async () => {
      const { service } = buildSut();

      await expect(
        service.createCampaign({
          tenantId: 'tenant-fantasma',
          sessionName: 'sessao-principal',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: ['contact-1'],
        }),
      ).rejects.toThrow(TenantNotFoundError);
    });

    it('materializar a mesma campanha duas vezes não duplica destinatários (idempotência)', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', neutral);

      const result = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1'],
      });

      // Segunda materialização manual sobre a MESMA campanha, mesmos dados.
      await campaigns.createRecipients('tenant-1', result.campaign.id, [
        { contactId: 'contact-1', status: 'pending' },
      ]);
      const summary = await campaigns.summarizeRecipients('tenant-1', result.campaign.id);
      expect(summary.total).toBe(1);
    });

    describe('origens combinadas (Reorganização Contatos/Campanhas, 2026-08-17)', () => {
      function buildSutWithLookup() {
        const tenants = new FakeTenantRepository();
        tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
        const campaigns = new FakeCampaignRepository();
        const contactLookup = new FakeContactLookup();
        const service = new CampaignService(
          campaigns,
          tenants,
          new NoopLogger(),
          undefined,
          contactLookup,
        );
        return { service, campaigns, contactLookup };
      }

      it('telefone que já é um Contato conhecido vira destinatário vinculado (nunca cria Contato)', async () => {
        const { service, campaigns, contactLookup } = buildSutWithLookup();
        campaigns.seedEligibility('contact-1', neutral);
        contactLookup.seed('5565988887777', 'contact-1');

        const result = await service.createCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao-principal',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: [],
          phoneRecipients: [{ rawPhone: '65988887777', name: 'Maria da Planilha' }],
        });

        expect(result.summary).toEqual({ total: 1, pending: 1, skipped: 0, skipReasons: {} });
        const { recipients } = await campaigns.listRecipients('tenant-1', result.campaign.id, {
          limit: 10,
        });
        expect(recipients[0].contactId).toBe('contact-1');
        expect(recipients[0].phoneE164).toBeUndefined();
      });

      it('telefone SEM Contato correspondente vira destinatário "solto" (phoneE164/name, sem contactId, sem criar Contato)', async () => {
        const { service, campaigns } = buildSutWithLookup();

        const result = await service.createCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao-principal',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: [],
          phoneRecipients: [{ rawPhone: '65988887777', name: 'Novo Lead' }],
        });

        expect(result.summary).toEqual({ total: 1, pending: 1, skipped: 0, skipReasons: {} });
        const { recipients } = await campaigns.listRecipients('tenant-1', result.campaign.id, {
          limit: 10,
        });
        expect(recipients[0]).toMatchObject({
          contactId: undefined,
          phoneE164: '5565988887777',
          name: 'Novo Lead',
          status: 'pending',
        });
      });

      it('combina as três origens sem duplicar quando um telefone digitado é o mesmo de um Contato já selecionado', async () => {
        const { service, campaigns, contactLookup } = buildSutWithLookup();
        campaigns.seedEligibility('contact-1', neutral);
        contactLookup.seed('5565988887777', 'contact-1');

        const result = await service.createCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao-principal',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: ['contact-1'],
          phoneRecipients: [{ rawPhone: '65988887777' }],
        });

        expect(result.summary.total).toBe(1);
      });

      it('telefones inválidos são descartados silenciosamente, sem derrubar a criação', async () => {
        const { service } = buildSutWithLookup();

        const result = await service.createCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao-principal',
          name: 'Campanha',
          messageTemplate: 'Oi',
          contactIds: [],
          phoneRecipients: [{ rawPhone: '123' }, { rawPhone: '65988887777' }],
        });

        expect(result.summary.total).toBe(1);
      });

      it('sem nenhum destinatário em nenhuma origem: lança NoRecipientsSelectedError', async () => {
        const { service } = buildSutWithLookup();
        await expect(
          service.createCampaign({
            tenantId: 'tenant-1',
            sessionName: 'sessao-principal',
            name: 'Campanha',
            messageTemplate: 'Oi',
            contactIds: [],
            phoneRecipients: [],
          }),
        ).rejects.toThrow(NoRecipientsSelectedError);
      });

      it('repassa personalizedMessage de um destinatário solto (planilha) até o destinatário materializado', async () => {
        const { service, campaigns } = buildSutWithLookup();
        const createRecipientsSpy = jest.spyOn(campaigns, 'createRecipients');

        await service.createCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao-1',
          name: 'Prospecção IA — lote 1',
          messageTemplate: 'Template genérico (não usado por quem tem personalizedMessage)',
          contactIds: [],
          phoneRecipients: [
            {
              rawPhone: '+55 21 98765-4321',
              name: 'Restaurante Exemplo',
              personalizedMessage: 'Mensagem única gerada pela IA para este lead.',
            },
          ],
        });

        const [, , recipients] = createRecipientsSpy.mock.calls.at(-1)!;
        expect(recipients).toHaveLength(1);
        expect(recipients[0].personalizedMessage).toBe(
          'Mensagem única gerada pela IA para este lead.',
        );
      });
    });
  });

  describe('getCampaign()', () => {
    it('devolve a campanha e o resumo de destinatários', async () => {
      const { service, campaigns } = buildSut();
      campaigns.seedEligibility('contact-1', neutral);
      const created = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao-principal',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1'],
      });

      const result = await service.getCampaign('tenant-1', created.campaign.id);

      expect(result.campaign.id).toBe(created.campaign.id);
      expect(result.summary.total).toBe(1);
    });

    it('lança CampaignNotFoundError para id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.getCampaign('tenant-1', 'campaign-fantasma')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });

    it('lança CampaignNotFoundError (não vaza dado) para campanha de OUTRO tenant', async () => {
      const tenants = new FakeTenantRepository();
      tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
      tenants.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
      const campaigns = new FakeCampaignRepository();
      const service = new CampaignService(campaigns, tenants, new NoopLogger());
      campaigns.seedEligibility('contact-1', neutral);
      const created = await service.createCampaign({
        tenantId: 'tenant-2',
        sessionName: 'sessao',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1'],
      });

      await expect(service.getCampaign('tenant-1', created.campaign.id)).rejects.toThrow(
        CampaignNotFoundError,
      );
    });
  });

  describe('listCampaigns()', () => {
    it('isola campanhas por tenant', async () => {
      const tenants = new FakeTenantRepository();
      tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
      tenants.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
      const campaigns = new FakeCampaignRepository();
      const service = new CampaignService(campaigns, tenants, new NoopLogger());
      campaigns.seedEligibility('contact-1', neutral);

      await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        name: 'Campanha do tenant 1',
        messageTemplate: 'Oi',
        contactIds: ['contact-1'],
      });

      const page = await service.listCampaigns('tenant-2', { limit: 20 });
      expect(page.campaigns).toEqual([]);
    });
  });

  describe('getSessionOverview() (retrofit visual 2026-08-18)', () => {
    it('lança TenantNotFoundError para tenant inexistente', async () => {
      const { service } = buildSut();
      await expect(service.getSessionOverview('tenant-fantasma', 'sessao')).rejects.toThrow(
        TenantNotFoundError,
      );
    });

    it('agrega status/enviados/respostas só da sessão pedida', async () => {
      const { service, campaigns } = buildSut();
      const c1 = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'vendas',
        status: 'running',
      });
      campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'vendas', status: 'completed' });
      campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'suporte', status: 'draft' });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId: c1,
        status: 'sent',
        sentAt: new Date('2026-08-10T00:00:00.000Z'),
      });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId: c1,
        status: 'replied',
        sentAt: new Date('2026-08-10T00:00:00.000Z'),
        repliedAt: new Date('2026-08-11T00:00:00.000Z'),
      });

      const overview = await service.getSessionOverview('tenant-1', 'vendas');

      expect(overview.totalCampaigns).toBe(2);
      expect(overview.statusCounts).toMatchObject({ running: 1, completed: 1, draft: 0 });
      expect(overview.totalSent).toBe(2); // sent + replied contam como "enviado"
      expect(overview.totalReplied).toBe(1);
      expect(overview.responseRate).toBe(0.5);
    });

    it('trend vem undefined quando o mês anterior não tem base para comparar', async () => {
      const { service } = buildSut();
      const overview = await service.getSessionOverview('tenant-1', 'sessao-vazia');
      expect(overview.trends.campaignsDeltaPct).toBeUndefined();
      expect(overview.trends.messagesSentDeltaPct).toBeUndefined();
      expect(overview.trends.responseRateDeltaPct).toBeUndefined();
    });
  });

  describe('startCampaign() (Fase L, Bloco L4)', () => {
    it('agenda todos os pendentes com delay crescente e muda status para running', async () => {
      const { service, campaigns, dispatcher } = buildSut();
      campaigns.seedEligibility('contact-1', neutral);
      campaigns.seedEligibility('contact-2', neutral);
      const created = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1', 'contact-2'],
      });

      const campaign = await service.startCampaign('tenant-1', created.campaign.id);

      expect(campaign.status).toBe('running');
      expect(dispatcher.scheduled).toHaveLength(2);
      expect(dispatcher.scheduled[0].delayMs).toBeLessThan(dispatcher.scheduled[1].delayMs);
    });

    it('sem nenhum destinatário pendente (todos suprimidos): vai direto para completed, sem agendar nada', async () => {
      const { service, campaigns, dispatcher } = buildSut();
      campaigns.seedEligibility('contact-1', { ...neutral, optedOut: true });
      const created = await service.createCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        name: 'Campanha',
        messageTemplate: 'Oi',
        contactIds: ['contact-1'],
      });

      const campaign = await service.startCampaign('tenant-1', created.campaign.id);

      expect(campaign.status).toBe('completed');
      expect(dispatcher.scheduled).toHaveLength(0);
    });

    it('retomar uma campanha PAUSED reagenda os PENDING restantes', async () => {
      const { service, campaigns, dispatcher } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'paused',
      });
      campaigns.seedRecipient({ tenantId: 'tenant-1', campaignId, contactId: 'contact-1' });

      const campaign = await service.startCampaign('tenant-1', campaignId);

      expect(campaign.status).toBe('running');
      expect(dispatcher.scheduled).toHaveLength(1);
    });

    it('lança InvalidCampaignTransitionError para campanha já RUNNING', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      await expect(service.startCampaign('tenant-1', campaignId)).rejects.toThrow(
        InvalidCampaignTransitionError,
      );
    });

    it('lança InvalidCampaignTransitionError para campanha COMPLETED', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'completed',
      });

      await expect(service.startCampaign('tenant-1', campaignId)).rejects.toThrow(
        InvalidCampaignTransitionError,
      );
    });

    it('lança CampaignNotFoundError para id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.startCampaign('tenant-1', 'campanha-fantasma')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });

    it('lança SendingEngineNotConfiguredError sem dispatcher configurado (modo degradado)', async () => {
      const tenants = new FakeTenantRepository();
      tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
      const campaigns = new FakeCampaignRepository();
      const service = new CampaignService(campaigns, tenants, new NoopLogger()); // sem dispatcher
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      await expect(service.startCampaign('tenant-1', campaignId)).rejects.toThrow(
        SendingEngineNotConfiguredError,
      );
    });

    it('setCampaignSendDispatcher() liga o motor depois da construção (injeção tardia)', async () => {
      const tenants = new FakeTenantRepository();
      tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
      const campaigns = new FakeCampaignRepository();
      const service = new CampaignService(campaigns, tenants, new NoopLogger());
      const dispatcher = new FakeCampaignSendDispatcher();
      service.setCampaignSendDispatcher(dispatcher);
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      campaigns.seedRecipient({ tenantId: 'tenant-1', campaignId, contactId: 'contact-1' });

      const campaign = await service.startCampaign('tenant-1', campaignId);

      expect(campaign.status).toBe('running');
      expect(dispatcher.scheduled).toHaveLength(1);
    });
  });

  describe('reopenCampaign() (retrofit 2026-08-18 — "reiniciar/refazer campanha")', () => {
    it.each(['completed', 'cancelled'] as const)(
      'devolve destinatários FAILED para pending, agenda e volta para running (%s)',
      async (status) => {
        const { service, campaigns, dispatcher } = buildSut();
        const campaignId = campaigns.seedCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao',
          status,
        });
        campaigns.seedRecipient({
          tenantId: 'tenant-1',
          campaignId,
          contactId: 'contact-1',
          status: 'failed',
          errorMessage: 'WhatsAppNotConnectedError: ...',
        });

        const campaign = await service.reopenCampaign('tenant-1', campaignId);

        expect(campaign.status).toBe('running');
        expect(dispatcher.scheduled).toHaveLength(1);
      },
    );

    it('NUNCA reagenda destinatários SKIPPED (opt-out/conversa ativa/contatado recentemente)', async () => {
      const { service, campaigns, dispatcher } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'completed',
      });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: 'contact-1',
        status: 'skipped',
        skipReason: 'opt_out',
      });

      const campaign = await service.reopenCampaign('tenant-1', campaignId);

      // Nenhum PENDING resultante (o único destinatário é SKIPPED, intocado) — vai para completed de novo, nada agendado.
      expect(campaign.status).toBe('completed');
      expect(dispatcher.scheduled).toHaveLength(0);
    });

    it('reagenda os PENDING já existentes junto com os FAILED resetados', async () => {
      const { service, campaigns, dispatcher } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'cancelled',
      });
      campaigns.seedRecipient({ tenantId: 'tenant-1', campaignId, contactId: 'contact-1' }); // já pending
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: 'contact-2',
        status: 'failed',
      });

      const campaign = await service.reopenCampaign('tenant-1', campaignId);

      expect(campaign.status).toBe('running');
      expect(dispatcher.scheduled).toHaveLength(2);
    });

    it.each(['draft', 'running', 'paused'] as const)(
      'lança InvalidCampaignTransitionError para campanha %s (só completed/cancelled reabrem)',
      async (status) => {
        const { service, campaigns } = buildSut();
        const campaignId = campaigns.seedCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao',
          status,
        });

        await expect(service.reopenCampaign('tenant-1', campaignId)).rejects.toThrow(
          InvalidCampaignTransitionError,
        );
      },
    );

    it('lança CampaignNotFoundError para id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.reopenCampaign('tenant-1', 'campanha-fantasma')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });

    it('lança SendingEngineNotConfiguredError sem dispatcher configurado (modo degradado)', async () => {
      const tenants = new FakeTenantRepository();
      tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
      const campaigns = new FakeCampaignRepository();
      const service = new CampaignService(campaigns, tenants, new NoopLogger()); // sem dispatcher
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'completed',
      });

      await expect(service.reopenCampaign('tenant-1', campaignId)).rejects.toThrow(
        SendingEngineNotConfiguredError,
      );
    });
  });

  describe('pauseCampaign()', () => {
    it('pausa uma campanha RUNNING', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      const campaign = await service.pauseCampaign('tenant-1', campaignId);

      expect(campaign.status).toBe('paused');
      expect(campaign.pausedReason).toBe('paused_manually');
    });

    it('lança InvalidCampaignTransitionError para campanha DRAFT (nunca foi iniciada)', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      await expect(service.pauseCampaign('tenant-1', campaignId)).rejects.toThrow(
        InvalidCampaignTransitionError,
      );
    });

    it('lança CampaignNotFoundError para id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.pauseCampaign('tenant-1', 'campanha-fantasma')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });
  });

  describe('cancelCampaign()', () => {
    it.each(['draft', 'running', 'paused'] as const)('cancela uma campanha %s', async (status) => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status,
      });

      const campaign = await service.cancelCampaign('tenant-1', campaignId);

      expect(campaign.status).toBe('cancelled');
    });

    it.each(['completed', 'cancelled'] as const)(
      'lança InvalidCampaignTransitionError para campanha já %s',
      async (status) => {
        const { service, campaigns } = buildSut();
        const campaignId = campaigns.seedCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao',
          status,
        });

        await expect(service.cancelCampaign('tenant-1', campaignId)).rejects.toThrow(
          InvalidCampaignTransitionError,
        );
      },
    );

    it('lança CampaignNotFoundError para id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.cancelCampaign('tenant-1', 'campanha-fantasma')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });
  });

  describe('deleteCampaign() (retrofit visual 2026-08-18)', () => {
    it.each(['draft', 'paused', 'completed', 'cancelled'] as const)(
      'apaga uma campanha %s',
      async (status) => {
        const { service, campaigns } = buildSut();
        const campaignId = campaigns.seedCampaign({
          tenantId: 'tenant-1',
          sessionName: 'sessao',
          status,
        });

        await service.deleteCampaign('tenant-1', campaignId);

        const page = await campaigns.listByTenant('tenant-1', { limit: 20 });
        expect(page.campaigns.find((c) => c.id === campaignId)).toBeUndefined();
      },
    );

    it('recusa apagar campanha RUNNING (precisa pausar/cancelar antes)', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      await expect(service.deleteCampaign('tenant-1', campaignId)).rejects.toThrow(
        InvalidCampaignTransitionError,
      );
      const page = await campaigns.listByTenant('tenant-1', { limit: 20 });
      expect(page.campaigns.find((c) => c.id === campaignId)).toBeDefined();
    });

    it('lança CampaignNotFoundError para id inexistente', async () => {
      const { service } = buildSut();
      await expect(service.deleteCampaign('tenant-1', 'campanha-fantasma')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });

    it('IDOR: não apaga campanha de OUTRO tenant (lança CampaignNotFoundError)', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-2', sessionName: 'sessao' });

      await expect(service.deleteCampaign('tenant-1', campaignId)).rejects.toThrow(
        CampaignNotFoundError,
      );
      const page = await campaigns.listByTenant('tenant-2', { limit: 20 });
      expect(page.campaigns.find((c) => c.id === campaignId)).toBeDefined();
    });
  });

  describe('getCampaignMetrics() (Fase L, Bloco L7)', () => {
    it('calcula o funil completo: resposta, estágio, escalonamento, custo e conversão', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      // 1 pending, 1 failed, 2 replied (uma converteu, outra não).
      campaigns.seedRecipient({ tenantId: 'tenant-1', campaignId, contactId: 'contact-pending' });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: 'contact-failed',
        status: 'failed',
      });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: 'contact-converteu',
        status: 'replied',
        conversationId: 'conversa-converteu',
        sentAt: new Date('2026-08-17T10:00:00.000Z'),
        repliedAt: new Date('2026-08-17T10:10:00.000Z'), // 10 min
      });
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: 'contact-nao-converteu',
        status: 'replied',
        conversationId: 'conversa-nao-converteu',
        sentAt: new Date('2026-08-17T10:00:00.000Z'),
        repliedAt: new Date('2026-08-17T10:30:00.000Z'), // 30 min
      });
      campaigns.seedConversationStage('conversa-converteu', 'closed_won');
      campaigns.seedConversationStage('conversa-nao-converteu', 'negotiating', new Date());
      campaigns.seedAiInteraction('conversa-converteu', 0.01);
      campaigns.seedAiInteraction('conversa-nao-converteu', 0.02, 'unknown_answer');

      const metrics = await service.getCampaignMetrics('tenant-1', campaignId);

      expect(metrics).toMatchObject({
        total: 4,
        pending: 1,
        failed: 1,
        replied: 2,
        sent: 0,
        skipped: 0,
        responseRate: 2 / 3, // 2 replied / 3 tentados (failed+replied)
        avgTimeToFirstReplyMinutes: 20, // média de 10 e 30
        stageCounts: { new: 0, contacted: 0, negotiating: 1, closed_won: 1, closed_lost: 0 },
        escalatedCount: 1,
        conversionRate: 0.5, // 1 closed_won / 2 conversas vinculadas
        aiCostUsd: 0.03,
        costPerConversionUsd: 0.03, // aiCostUsd / 1 closed_won
        unknownAnswerCount: 1,
      });
    });

    it('métricas sem denominador válido vêm undefined, nunca zero disfarçado', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      campaigns.seedRecipient({ tenantId: 'tenant-1', campaignId, contactId: 'contact-1' }); // só pending

      const metrics = await service.getCampaignMetrics('tenant-1', campaignId);

      expect(metrics.responseRate).toBeUndefined();
      expect(metrics.avgTimeToFirstReplyMinutes).toBeUndefined();
      expect(metrics.conversionRate).toBeUndefined();
      expect(metrics.costPerConversionUsd).toBeUndefined();
      expect(metrics.aiCostUsd).toBe(0);
    });

    it('lança CampaignNotFoundError para id inexistente', async () => {
      const { service } = buildSut();

      await expect(service.getCampaignMetrics('tenant-1', 'campanha-fantasma')).rejects.toThrow(
        CampaignNotFoundError,
      );
    });

    it('lança CampaignNotFoundError (não vaza dado) para campanha de OUTRO tenant', async () => {
      const tenants = new FakeTenantRepository();
      tenants.seed({ id: 'tenant-1', name: 'Empresa Um', apiKeyHash: 'hash' });
      tenants.seed({ id: 'tenant-2', name: 'Empresa Dois', apiKeyHash: 'hash-2' });
      const campaigns = new FakeCampaignRepository();
      const service = new CampaignService(campaigns, tenants, new NoopLogger());
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-2', sessionName: 'sessao' });

      await expect(service.getCampaignMetrics('tenant-1', campaignId)).rejects.toThrow(
        CampaignNotFoundError,
      );
    });
  });

  // --- Fase L, Bloco L8 (mídia na campanha) ---

  describe('attachCampaignMedia()', () => {
    it('anexa mídia a uma campanha DRAFT e devolve os metadados (sem o binário)', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      const updated = await service.attachCampaignMedia('tenant-1', campaignId, {
        contentType: 'image',
        buffer: Buffer.from('conteudo-arbitrario'),
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });

      expect(updated.media).toEqual({
        contentType: 'image',
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });
    });

    it('substituir a mídia de uma campanha DRAFT que já tinha uma: a nova prevalece', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      await service.attachCampaignMedia('tenant-1', campaignId, {
        contentType: 'image',
        buffer: Buffer.from('primeira'),
        mimeType: 'image/jpeg',
      });

      const updated = await service.attachCampaignMedia('tenant-1', campaignId, {
        contentType: 'document',
        buffer: Buffer.from('segunda'),
        mimeType: 'application/pdf',
        fileName: 'catalogo.pdf',
      });

      expect(updated.media).toEqual({
        contentType: 'document',
        mimeType: 'application/pdf',
        fileName: 'catalogo.pdf',
      });
    });

    it('campanha RUNNING: lança InvalidCampaignTransitionError (só DRAFT pode ter mídia anexada)', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      await expect(
        service.attachCampaignMedia('tenant-1', campaignId, {
          contentType: 'image',
          buffer: Buffer.from('bytes'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow(InvalidCampaignTransitionError);
    });

    it('arquivo maior que o teto: lança CampaignMediaTooLargeError, nunca chega ao repositório', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      const oversized = Buffer.alloc(MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES + 1);

      await expect(
        service.attachCampaignMedia('tenant-1', campaignId, {
          contentType: 'image',
          buffer: oversized,
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow(CampaignMediaTooLargeError);
      const found = await campaigns.findById('tenant-1', campaignId);
      expect(found?.media).toBeUndefined();
    });

    it('assinatura binária de OUTRA categoria (JPEG declarado como document): lança CampaignMediaTypeMismatchError', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      const jpegSignature = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x00]);

      await expect(
        service.attachCampaignMedia('tenant-1', campaignId, {
          contentType: 'document',
          buffer: jpegSignature,
          mimeType: 'application/pdf',
        }),
      ).rejects.toThrow(CampaignMediaTypeMismatchError);
    });

    it('campanha inexistente: lança CampaignNotFoundError', async () => {
      const { service } = buildSut();

      await expect(
        service.attachCampaignMedia('tenant-1', 'campanha-fantasma', {
          contentType: 'image',
          buffer: Buffer.from('bytes'),
          mimeType: 'image/jpeg',
        }),
      ).rejects.toThrow(CampaignNotFoundError);
    });
  });

  describe('removeCampaignMedia()', () => {
    it('remove a mídia de uma campanha DRAFT que tinha uma', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      await service.attachCampaignMedia('tenant-1', campaignId, {
        contentType: 'image',
        buffer: Buffer.from('bytes'),
        mimeType: 'image/jpeg',
      });

      const updated = await service.removeCampaignMedia('tenant-1', campaignId);

      expect(updated.media).toBeUndefined();
    });

    it('campanha RUNNING: lança InvalidCampaignTransitionError', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({
        tenantId: 'tenant-1',
        sessionName: 'sessao',
        status: 'running',
      });

      await expect(service.removeCampaignMedia('tenant-1', campaignId)).rejects.toThrow(
        InvalidCampaignTransitionError,
      );
    });
  });

  describe('getCampaignMedia()', () => {
    it('devolve o binário de uma campanha com mídia anexada', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
      await service.attachCampaignMedia('tenant-1', campaignId, {
        contentType: 'image',
        buffer: Buffer.from('conteudo-real'),
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });

      const media = await service.getCampaignMedia('tenant-1', campaignId);

      expect(media).toEqual({
        contentType: 'image',
        buffer: Buffer.from('conteudo-real'),
        mimeType: 'image/jpeg',
        fileName: 'promo.jpg',
      });
    });

    it('campanha sem mídia: lança CampaignMediaNotFoundError', async () => {
      const { service, campaigns } = buildSut();
      const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });

      await expect(service.getCampaignMedia('tenant-1', campaignId)).rejects.toThrow(
        CampaignMediaNotFoundError,
      );
    });
  });
});
