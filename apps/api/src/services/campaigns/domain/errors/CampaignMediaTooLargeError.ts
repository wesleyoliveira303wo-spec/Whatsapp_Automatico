/**
 * Erro de Domain para `POST .../campaigns/:id/media` (Fase L, Bloco L8) — o
 * arquivo enviado excede `MAX_CAMPAIGN_MEDIA_UPLOAD_BYTES`. Mapeado para
 * `413 Payload Too Large` na Presentation (`campaignsErrorHandler.ts`) — mesmo
 * papel de `AgentMediaTooLargeError` (`services/conversations`), duplicado de
 * propósito por bounded context, não uma exceção nova (nenhum dos dois
 * importa do outro).
 */
export class CampaignMediaTooLargeError extends Error {
  constructor(
    public readonly receivedBytes: number,
    public readonly maxBytes: number,
  ) {
    super(`Mídia enviada (${receivedBytes} bytes) excede o teto permitido (${maxBytes} bytes).`);
    this.name = 'CampaignMediaTooLargeError';
  }
}
