/**
 * Erro de Domain para `POST .../campaigns/:id/media` (Fase L, Bloco L8) — o
 * binário enviado tem uma assinatura ("magic bytes") forte de uma categoria
 * DIFERENTE da declarada em `x-media-content-type`. Reusa a mesma checagem de
 * `mediaMagicBytes.ts` (`services/conversations/domain`) — mesmo papel de
 * `AgentMediaTypeMismatchError`, duplicado por bounded context. Mapeado para
 * `400 Bad Request`.
 */
export class CampaignMediaTypeMismatchError extends Error {
  constructor(
    public readonly declaredCategory: string,
    public readonly detectedCategory: string,
  ) {
    super(
      `O arquivo enviado não parece ser do tipo declarado ("${declaredCategory}") — foi identificado como "${detectedCategory}" pela assinatura binária.`,
    );
    this.name = 'CampaignMediaTypeMismatchError';
  }
}
