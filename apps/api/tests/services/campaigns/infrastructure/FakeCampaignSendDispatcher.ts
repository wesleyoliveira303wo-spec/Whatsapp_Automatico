import { CampaignSendDispatcher } from '../../../../src/services/campaigns/domain/dispatchers/CampaignSendDispatcher';

export class FakeCampaignSendDispatcher implements CampaignSendDispatcher {
  readonly scheduled: { tenantId: string; campaignId: string; recipientId: string; delayMs: number }[] =
    [];

  async scheduleRecipient(
    tenantId: string,
    campaignId: string,
    recipientId: string,
    delayMs: number,
  ): Promise<void> {
    this.scheduled.push({ tenantId, campaignId, recipientId, delayMs });
  }
}
