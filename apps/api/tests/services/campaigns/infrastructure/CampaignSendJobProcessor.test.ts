import { CampaignSendJobProcessor } from '../../../../src/services/campaigns/infrastructure/CampaignSendJobProcessor';
import { NoopLogger } from '../../../../src/shared/infrastructure/logging/NoopLogger';
import { FakeCampaignRepository } from './FakeCampaignRepository';
import { FakeCampaignMessageSender } from './FakeCampaignMessageSender';

function buildSut(): {
  processor: CampaignSendJobProcessor;
  campaigns: FakeCampaignRepository;
  sender: FakeCampaignMessageSender;
} {
  const campaigns = new FakeCampaignRepository();
  const sender = new FakeCampaignMessageSender();
  const processor = new CampaignSendJobProcessor(campaigns, sender, new NoopLogger());
  return { processor, campaigns, sender };
}

describe('CampaignSendJobProcessor (Fase L, Bloco L4)', () => {
  it('envia e marca o destinatário como sent', async () => {
    const { processor, campaigns, sender } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
    });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    const recipient = await campaigns.findRecipientById('tenant-1', recipientId);
    expect(recipient?.status).toBe('sent');
    expect(recipient?.conversationId).toBe('conversation-contact-1');
    expect(recipient?.attemptedAt).toBeInstanceOf(Date);
    expect(sender.calls).toEqual([
      { tenantId: 'tenant-1', sessionName: 'sessao', contactId: 'contact-1', content: 'Olá!' },
    ]);
  });

  it('campanha não RUNNING: não envia nada, destinatário continua pending', async () => {
    const { processor, campaigns, sender } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'paused',
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
    });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    expect(sender.calls).toHaveLength(0);
    const recipient = await campaigns.findRecipientById('tenant-1', recipientId);
    expect(recipient?.status).toBe('pending');
  });

  it('campanha inexistente: não lança, só não envia', async () => {
    const { processor, sender } = buildSut();

    await expect(
      processor.process({
        tenantId: 'tenant-1',
        campaignId: 'campanha-fantasma',
        recipientId: 'recipient-fantasma',
      }),
    ).resolves.toBeUndefined();
    expect(sender.calls).toHaveLength(0);
  });

  it('destinatário já processado (SENT): idempotência — não reenvia', async () => {
    const { processor, campaigns, sender } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
      status: 'sent',
      sentAt: new Date(),
    });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    expect(sender.calls).toHaveLength(0);
  });

  it('falha no envio: marca failed com o motivo, não SENT', async () => {
    const { processor, campaigns, sender } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
    });
    sender.queueResult('contact-1', {
      ok: false,
      failureReason: 'sem_conversa_existente_nesta_sessao',
    });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    const recipient = await campaigns.findRecipientById('tenant-1', recipientId);
    expect(recipient?.status).toBe('failed');
    expect(recipient?.errorMessage).toBe('sem_conversa_existente_nesta_sessao');
    expect(recipient?.sentAt).toBeUndefined();
  });

  it('teto diário atingido: pausa a campanha e não envia (destinatário continua pending)', async () => {
    const { processor, campaigns, sender } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
      dailyLimit: 1,
    });
    // Um destinatário JÁ enviado hoje — atinge o teto de 1.
    campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-ja-enviado',
      status: 'sent',
      sentAt: new Date(),
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-2',
    });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    expect(sender.calls).toHaveLength(0);
    const campaign = await campaigns.findById('tenant-1', campaignId);
    expect(campaign?.status).toBe('paused');
    expect(campaign?.pausedReason).toBe('daily_limit_reached');
    const recipient = await campaigns.findRecipientById('tenant-1', recipientId);
    expect(recipient?.status).toBe('pending');
  });

  it('disjuntor de segurança: taxa de falha alta pausa a campanha automaticamente', async () => {
    const { processor, campaigns, sender } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
    });
    // 4 tentativas anteriores, 3 falhas — abaixo do limiar por enquanto (75% já ultrapassa, mas testamos a 5ª disparando).
    for (let i = 0; i < 3; i += 1) {
      campaigns.seedRecipient({
        tenantId: 'tenant-1',
        campaignId,
        contactId: `contact-falha-${i}`,
        status: 'failed',
        attemptedAt: new Date(Date.now() - (10 - i) * 1000),
        errorMessage: 'erro',
      });
    }
    campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-ok',
      status: 'sent',
      sentAt: new Date(Date.now() - 5000),
      attemptedAt: new Date(Date.now() - 5000),
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-nova',
    });
    sender.queueResult('contact-nova', { ok: false, failureReason: 'erro_ao_enviar' });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    const campaign = await campaigns.findById('tenant-1', campaignId);
    expect(campaign?.status).toBe('paused');
    expect(campaign?.pausedReason).toBe('high_failure_rate');
  });

  it('sem mais pendentes após o envio: campanha vira completed', async () => {
    const { processor, campaigns } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
    });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    const campaign = await campaigns.findById('tenant-1', campaignId);
    expect(campaign?.status).toBe('completed');
  });

  it('ainda há pendentes após o envio: campanha continua running', async () => {
    const { processor, campaigns } = buildSut();
    const campaignId = campaigns.seedCampaign({
      tenantId: 'tenant-1',
      sessionName: 'sessao',
      status: 'running',
    });
    const recipientId = campaigns.seedRecipient({
      tenantId: 'tenant-1',
      campaignId,
      contactId: 'contact-1',
    });
    campaigns.seedRecipient({ tenantId: 'tenant-1', campaignId, contactId: 'contact-2' });

    await processor.process({ tenantId: 'tenant-1', campaignId, recipientId });

    const campaign = await campaigns.findById('tenant-1', campaignId);
    expect(campaign?.status).toBe('running');
  });
});
