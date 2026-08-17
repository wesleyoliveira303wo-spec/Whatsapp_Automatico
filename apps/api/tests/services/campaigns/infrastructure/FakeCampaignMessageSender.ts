import {
  CampaignMessageSendResult,
  CampaignMessageSender,
} from '../../../../src/services/campaigns/domain/providers/CampaignMessageSender';

/** Fake em memória de `CampaignMessageSender` — configurável por `contactId` via `queueResult`. */
export class FakeCampaignMessageSender implements CampaignMessageSender {
  private readonly results = new Map<string, CampaignMessageSendResult>();
  readonly calls: { tenantId: string; sessionName: string; contactId: string; content: string }[] =
    [];

  async send(
    tenantId: string,
    sessionName: string,
    contactId: string,
    content: string,
  ): Promise<CampaignMessageSendResult> {
    this.calls.push({ tenantId, sessionName, contactId, content });
    return this.results.get(contactId) ?? { ok: true, conversationId: `conversation-${contactId}` };
  }

  queueResult(contactId: string, result: CampaignMessageSendResult): void {
    this.results.set(contactId, result);
  }
}
