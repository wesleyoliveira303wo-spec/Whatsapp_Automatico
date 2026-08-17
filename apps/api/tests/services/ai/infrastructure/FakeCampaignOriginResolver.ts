import {
  CampaignOriginInfo,
  CampaignOriginResolver,
} from '../../../../src/services/ai/domain/repositories/CampaignOriginResolver';

/** Fase L, Bloco L6 — Fake de `CampaignOriginResolver`. */
export class FakeCampaignOriginResolver implements CampaignOriginResolver {
  private origins = new Map<string, CampaignOriginInfo>();
  private shouldFailNext = false;

  seed(conversationId: string, messageSent: string): void {
    this.origins.set(conversationId, { messageSent });
  }

  failNextFind(): void {
    this.shouldFailNext = true;
  }

  async findOrigin(
    _tenantId: string,
    conversationId: string,
  ): Promise<CampaignOriginInfo | undefined> {
    if (this.shouldFailNext) {
      this.shouldFailNext = false;
      throw new Error('falha simulada');
    }
    return this.origins.get(conversationId);
  }
}
