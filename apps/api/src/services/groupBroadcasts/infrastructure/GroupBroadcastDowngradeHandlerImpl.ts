import { GroupBroadcastDowngradeHandler } from '../../billing/domain/providers/GroupBroadcastDowngradeHandler';
import { GroupBroadcastService } from '../application/GroupBroadcastService';

/** Adapta `GroupBroadcastService` à porta que `services/billing` consome (B5, etapa 3). */
export class GroupBroadcastDowngradeHandlerImpl implements GroupBroadcastDowngradeHandler {
  constructor(private readonly groupBroadcastService: GroupBroadcastService) {}

  async pauseRunning(tenantId: string): Promise<void> {
    await this.groupBroadcastService.pauseAllRunningForPlanDowngrade(tenantId);
  }
}
