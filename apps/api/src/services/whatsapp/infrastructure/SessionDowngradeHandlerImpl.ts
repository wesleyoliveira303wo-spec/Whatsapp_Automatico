import { SessionDowngradeHandler } from '../../billing/domain/providers/SessionDowngradeHandler';
import { WhatsAppSessionService } from '../application/WhatsAppSessionService';

/** Adapta `WhatsAppSessionService` à porta que `services/billing` consome (B5, etapa 3). */
export class SessionDowngradeHandlerImpl implements SessionDowngradeHandler {
  constructor(private readonly sessionService: WhatsAppSessionService) {}

  async detachExcessSessions(tenantId: string, newLimit: number): Promise<void> {
    await this.sessionService.detachExcessSessions(tenantId, newLimit);
  }
}
