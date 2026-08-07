/**
 * Erro de Domain para `GET .../messages/:messageId/media` (Fase 1, Bloco
 * F1.1, ADR #90) — cobre TRÊS situações distintas com a mesma resposta
 * (404, mesmo racional de `ConversationNotFoundError` não diferenciar
 * "não existe" de "é de outro tenant"):
 * (1) a mensagem não existe/não pertence à conversa/tenant;
 * (2) a mensagem existe mas é `contentType: 'text'` (sem `media`) — pedir
 *     mídia de uma mensagem de texto é um erro de uso, não uma mídia
 *     "temporariamente indisponível";
 * (3) a mídia não pôde ser baixada (URL expirada, sem `MediaDownloader`
 *     configurado, timeout) — ver `MediaDownloader.download`, que nunca
 *     lança, então esta é a tradução para "não encontrada" na Presentation.
 */
export class MessageMediaNotFoundError extends Error {
  constructor(messageId: string) {
    super(`Media not found for message: ${messageId}`);
    this.name = 'MessageMediaNotFoundError';
  }
}
