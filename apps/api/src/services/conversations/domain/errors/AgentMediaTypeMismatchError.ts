/**
 * Erro de Domain para `POST .../conversations/:id/media` (Fase 1, Bloco
 * F1.10) — o binário enviado tem uma assinatura ("magic bytes") forte de uma
 * categoria DIFERENTE da declarada em `x-media-content-type` (ex.: o
 * operador declarou `document`, mas o arquivo começa com a assinatura de um
 * PNG). Ver `mediaMagicBytes.ts` para os limites deliberados dessa checagem
 * (não bloqueia formatos sem assinatura reconhecida, como a maioria dos
 * documentos). Mapeado para `400 Bad Request` (erro de validação de entrada,
 * mesma classe de `AgentMediaTooLargeError`, mas nunca confundido com ele —
 * `instanceof` próprio).
 */
export class AgentMediaTypeMismatchError extends Error {
  constructor(
    public readonly declaredCategory: string,
    public readonly detectedCategory: string,
  ) {
    super(
      `O arquivo enviado não parece ser do tipo declarado ("${declaredCategory}") — foi identificado como "${detectedCategory}" pela assinatura binária.`,
    );
    this.name = 'AgentMediaTypeMismatchError';
  }
}
