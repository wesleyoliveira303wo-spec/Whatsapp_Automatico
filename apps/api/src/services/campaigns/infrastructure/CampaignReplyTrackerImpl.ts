import { CampaignReplyTracker } from '../../conversations/domain/repositories/CampaignReplyTracker';
import { CampaignRepository } from '../domain/repositories/CampaignRepository';
import { Logger } from '../../../shared/domain/Logger';

/**
 * Implementação real de `CampaignReplyTracker` (port de
 * `services/conversations/domain`) — Fase L, Bloco L6. Adapter fino sobre
 * `CampaignRepository.markRepliedByConversationId`, mesmo papel estrutural
 * de `KeywordOptOutDetector` (adapter em `contacts/infrastructure`
 * implementando um port de `conversations/domain`).
 *
 * NUNCA LANÇA — ver docstring da porta.
 */
export class CampaignReplyTrackerImpl implements CampaignReplyTracker {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly logger: Logger,
  ) {}

  async markRepliedIfCampaignOrigin(tenantId: string, conversationId: string): Promise<void> {
    try {
      await this.campaignRepository.markRepliedByConversationId(tenantId, conversationId);
    } catch (error) {
      this.logger.warn('Falha ao marcar resposta de campanha', {
        tenantId,
        conversationId,
        error,
      });
    }
  }
}
