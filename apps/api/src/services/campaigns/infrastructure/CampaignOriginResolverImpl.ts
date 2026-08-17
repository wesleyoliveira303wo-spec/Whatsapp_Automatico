import {
  CampaignOriginInfo,
  CampaignOriginResolver,
} from '../../ai/domain/repositories/CampaignOriginResolver';
import { CampaignRepository } from '../domain/repositories/CampaignRepository';
import { Logger } from '../../../shared/domain/Logger';

/**
 * Implementação real de `CampaignOriginResolver` (port de
 * `services/ai/domain`) — Fase L, Bloco L6. Adapter fino sobre
 * `CampaignRepository.findOriginByConversationId`, mesmo papel estrutural de
 * `CampaignReplyTrackerImpl`.
 *
 * NUNCA LANÇA — ver docstring da porta.
 */
export class CampaignOriginResolverImpl implements CampaignOriginResolver {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly logger: Logger,
  ) {}

  async findOrigin(
    tenantId: string,
    conversationId: string,
  ): Promise<CampaignOriginInfo | undefined> {
    try {
      return await this.campaignRepository.findOriginByConversationId(tenantId, conversationId);
    } catch (error) {
      this.logger.warn('Falha ao resolver origem de campanha da conversa', {
        tenantId,
        conversationId,
        error,
      });
      return undefined;
    }
  }
}
