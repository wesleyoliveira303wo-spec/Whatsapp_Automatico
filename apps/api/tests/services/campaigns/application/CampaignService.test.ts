import { CampaignService } from '../../../../src/services/campaigns/application/CampaignService';
import { TenantNotFoundError } from '../../../../src/shared/tenant/domain/errors/TenantNotFoundError';
import { CampaignNotFoundError } from '../../../../src/services/campaigns/domain/errors/CampaignNotFoundError';
import { NoRecipientsSelectedError } from '../../../../src/services/campaigns/domain/errors/NoRecipientsSelectedError';
import { InvalidCampaignTransitionError } from '../../../../src/services/campaigns/domain/errors/InvalidCampaignTransitionError';
import { SendingEngineNotConfiguredError } from '../../../../src/services/campaigns/domain/errors/SendingEngineNotConfiguredError';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeTenantRepository } from '../../../shared/tenant/FakeTenantRepository';
import { FakeCampaignRepository } from '../infrastructure/FakeCampaignRepository';
import { FakeCampaignSendDispatcher } from '../infrastructure/FakeCampaignSendDispatcher';

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
    it.each(['draft', 'running', 'paused'] as const)(
      'cancela uma campanha %s',
      async (status) => {
        const { service, campaigns } = buildSut();
        const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao', status });

        const campaign = await service.cancelCampaign('tenant-1', campaignId);

        expect(campaign.status).toBe('cancelled');
      },
    );

    it.each(['completed', 'cancelled'] as const)(
      'lança InvalidCampaignTransitionError para campanha já %s',
      async (status) => {
        const { service, campaigns } = buildSut();
        const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao', status });

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
});
