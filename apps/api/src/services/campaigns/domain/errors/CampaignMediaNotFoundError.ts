/**
 * Erro de Domain para `GET .../campaigns/:id/media` (Fase L, Bloco L8) — a
 * campanha existe (senão seria `CampaignNotFoundError`), mas não tem nenhum
 * anexo de mídia. Mapeado para `404 Not Found`.
 */
export class CampaignMediaNotFoundError extends Error {
  constructor(public readonly campaignId: string) {
    super(`Campanha "${campaignId}" não tem mídia anexada.`);
    this.name = 'CampaignMediaNotFoundError';
  }
}
