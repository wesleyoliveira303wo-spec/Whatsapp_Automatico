import { CampaignOriginResolverImpl } from '../../../../src/services/campaigns/infrastructure/CampaignOriginResolverImpl';
import { CampaignRepository } from '../../../../src/services/campaigns/domain/repositories/CampaignRepository';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeCampaignRepository } from './FakeCampaignRepository';

describe('CampaignOriginResolverImpl (Fase L, Bloco L6)', () => {
  it('delega para campaignRepository.findOriginByConversationId', async () => {
    const campaigns = new FakeCampaignRepository();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      messageTemplate: 'Olá! Promoção especial.',
    });
    campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
      status: 'sent',
      conversationId: 'conversation-1',
      sentAt: new Date(),
    });
    const resolver = new CampaignOriginResolverImpl(campaigns, new NoopLogger());

    const origin = await resolver.findOrigin('tenant-1', 'conversation-1');

    expect(origin).toEqual({ messageSent: 'Olá! Promoção especial.' });
  });

  it('devolve undefined quando a conversa não tem origem de campanha', async () => {
    const campaigns = new FakeCampaignRepository();
    const resolver = new CampaignOriginResolverImpl(campaigns, new NoopLogger());

    const origin = await resolver.findOrigin('tenant-1', 'conversation-sem-campanha');

    expect(origin).toBeUndefined();
  });

  it('NUNCA lança — engole erro do repositório e devolve undefined', async () => {
    const failingRepository = {
      findOriginByConversationId: async () => {
        throw new Error('falha simulada');
      },
    } as unknown as CampaignRepository;
    const resolver = new CampaignOriginResolverImpl(failingRepository, new NoopLogger());

    await expect(resolver.findOrigin('tenant-1', 'conversation-1')).resolves.toBeUndefined();
  });
});
