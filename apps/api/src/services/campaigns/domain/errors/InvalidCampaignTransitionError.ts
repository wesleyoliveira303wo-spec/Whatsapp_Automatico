import { CampaignStatus } from '../entities/Campaign';

/** Transição de estado de campanha não permitida (ex.: pausar uma campanha já `completed`). */
export class InvalidCampaignTransitionError extends Error {
  constructor(
    public readonly currentStatus: CampaignStatus,
    public readonly attemptedAction: 'start' | 'pause' | 'cancel',
  ) {
    super(
      `Não é possível "${attemptedAction}" uma campanha com status "${currentStatus}".`,
    );
    this.name = 'InvalidCampaignTransitionError';
  }
}
