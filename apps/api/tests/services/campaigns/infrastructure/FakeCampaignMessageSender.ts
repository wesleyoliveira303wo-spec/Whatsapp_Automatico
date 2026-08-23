import {
  CampaignMessageSendResult,
  CampaignMessageSender,
  CampaignSendMedia,
  CampaignSendRecipient,
} from '../../../../src/services/campaigns/domain/providers/CampaignMessageSender';

/** Chave interna do fake: `contactId` quando presente, senão `phoneE164` (mesma regra de resolução do sender real). */
function keyFor(recipient: CampaignSendRecipient): string {
  return recipient.contactId ?? recipient.phoneE164 ?? '';
}

/** Fake em memória de `CampaignMessageSender` — configurável por `contactId`/`phoneE164` via `queueResult`. */
export class FakeCampaignMessageSender implements CampaignMessageSender {
  private readonly results = new Map<string, CampaignMessageSendResult>();
  readonly calls: {
    tenantId: string;
    sessionName: string;
    recipient: CampaignSendRecipient;
    content: string;
    media?: CampaignSendMedia;
  }[] = [];

  async send(
    tenantId: string,
    sessionName: string,
    recipient: CampaignSendRecipient,
    content: string,
    media?: CampaignSendMedia,
  ): Promise<CampaignMessageSendResult> {
    this.calls.push({ tenantId, sessionName, recipient, content, media });
    const key = keyFor(recipient);
    return this.results.get(key) ?? { ok: true, conversationId: `conversation-${key}` };
  }

  queueResult(key: string, result: CampaignMessageSendResult): void {
    this.results.set(key, result);
  }
}
