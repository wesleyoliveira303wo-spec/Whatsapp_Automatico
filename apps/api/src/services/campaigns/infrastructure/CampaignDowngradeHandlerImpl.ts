import { CampaignDowngradeHandler } from '../../billing/domain/providers/CampaignDowngradeHandler';
import { CampaignService } from '../application/CampaignService';

/** Adapta `CampaignService` à porta que `services/billing` consome (B5, etapa 3). */
export class CampaignDowngradeHandlerImpl implements CampaignDowngradeHandler {
  constructor(private readonly campaignService: CampaignService) {}

  async pauseRunning(tenantId: string): Promise<void> {
    await this.campaignService.pauseAllRunningForPlanDowngrade(tenantId);
  }
}
