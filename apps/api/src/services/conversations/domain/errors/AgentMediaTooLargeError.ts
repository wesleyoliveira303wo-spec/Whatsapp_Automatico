/**
 * Erro de Domain para `POST .../conversations/:id/media` (Fase 1, Bloco
 * F1.3) — o arquivo enviado pelo operador excede `MAX_AGENT_MEDIA_UPLOAD_BYTES`.
 * Mapeado para `413 Payload Too Large` na Presentation (`conversationsErrorHandler.ts`),
 * diferente de `MessageMediaNotFoundError` (404) — este é um erro de
 * validação de ENTRADA do operador, não uma mídia ausente.
 */
export class AgentMediaTooLargeError extends Error {
  constructor(
    public readonly receivedBytes: number,
    public readonly maxBytes: number,
  ) {
    super(`Mídia enviada (${receivedBytes} bytes) excede o teto permitido (${maxBytes} bytes).`);
    this.name = 'AgentMediaTooLargeError';
  }
}
