import { CampaignReplyTrackerImpl } from '../../../../src/services/campaigns/infrastructure/CampaignReplyTrackerImpl';
import { CampaignRepository } from '../../../../src/services/campaigns/domain/repositories/CampaignRepository';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeCampaignRepository } from './FakeCampaignRepository';

describe('CampaignReplyTrackerImpl (Fase L, Bloco L6)', () => {
  it('delega para campaignRepository.markRepliedByConversationId', async () => {
    const campaigns = new FakeCampaignRepository();
    const campaignId = campaigns.seedCampaign({ tenantId: 'tenant-1', sessionName: 'sessao' });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
      status: 'sent',
      conversationId: 'conversation-1',
      sentAt: new Date(),
    });
    const tracker = new CampaignReplyTrackerImpl(campaigns, new NoopLogger());

    await tracker.markRepliedIfCampaignOrigin('tenant-1', 'conversation-1');

    const recipient = await campaigns.findRecipientById('tenant-1', recipientId);
    expect(recipient?.status).toBe('replied');
  });

  it('NUNCA lança — engole erro do repositório e loga', async () => {
    const failingRepository = {
      markRepliedByConversationId: async () => {
        throw new Error('falha simulada');
      },
    } as unknown as CampaignRepository;
    const tracker = new CampaignReplyTrackerImpl(failingRepository, new NoopLogger());

    await expect(
      tracker.markRepliedIfCampaignOrigin('tenant-1', 'conversation-1'),
    ).resolves.toBeUndefined();
  });
});
