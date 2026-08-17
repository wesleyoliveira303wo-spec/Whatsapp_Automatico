/** Campanha inexistente, ou de outro tenant — mesmo tratamento (nunca vaza qual dos dois é o caso). */
export class CampaignNotFoundError extends Error {
  constructor(public readonly campaignId: string) {
    super(`Campanha "${campaignId}" não encontrada.`);
    this.name = 'CampaignNotFoundError';
  }
}
