/**
 * Tipo de conteúdo de uma `Message` — Milestone Fase 1, Bloco F1.1 (suporte a
 * mídia, ver `DECISIONS.md` ADR #90). `'text'` é o único tipo que existia até
 * aqui (implícito, todo `Message.content` era sempre texto); os demais
 * espelham exatamente as categorias que o WhatsApp/Baileys distinguem
 * (`imageMessage`/`audioMessage`/`videoMessage`/`documentMessage`/
 * `stickerMessage`) — nenhuma categoria nova inventada além do que o
 * protocolo já separa.
 *
 * Deliberadamente acompanha `content` em vez de substituí-lo: para mídia,
 * `content` guarda a legenda (`caption`), quando houver, ou string vazia —
 * nunca `null`/`undefined`, para não forçar todo consumidor existente
 * (`PromptBuilder`, `MessageTimeline`) a lidar com um `content` ausente.
 */
export type MessageContentType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker';

/**
 * Referência a um arquivo de mídia do WhatsApp — nunca o conteúdo binário em
 * si (ver ADR #90: mídia é servida sob demanda via proxy, nunca persistida
 * em disco/storage de objetos nesta rodada). `mediaKeyEncrypted` guarda a
 * `mediaKey` do protocolo Signal/WhatsApp já cifrada pelo mesmo `Cipher`
 * usado em `TenantCredential` (nunca em texto plano) — sem ela, a URL
 * criptografada (`.enc`) do WhatsApp é inútil (não é uma URL pública comum).
 */
export interface MessageMediaReference {
  mimeType: string;
  /** URL `.enc` bruta do CDN do WhatsApp — expira e é inútil sem `mediaKeyEncrypted`. */
  url: string;
  mediaKeyEncrypted: string;
  /** Nome de arquivo original, quando o WhatsApp o informa (comum em `document`). */
  fileName?: string;
}

/**
 * Uma mensagem (inbound ou outbound) dentro de uma `Conversation` —
 * Milestone 3, Bloco 2. Registro append-only: uma vez criada, nunca é
 * atualizada — mesmo espírito de `WhatsAppSessionEvent` (log imutável), por
 * isso não expõe `updatedAt`.
 *
 * `direction` tipado como união literal, não `string` livre (mesmo racional
 * do F6/ADR #15). Só `'inbound'` é produzida pelo Bloco 2
 * (`MessageIngestionService`); `'outbound'` existe desde já porque é
 * inerente ao que uma "mensagem" é neste domínio (uma conversa tem os dois
 * sentidos por definição) — o BLOCO que vai de fato criar uma `Message`
 * `'outbound'` (a resposta gerada pela IA, após validação) é o Bloco 4, não
 * antecipado aqui.
 *
 * `occurredAt` é o instante de negócio (quando a mensagem foi recebida pelo
 * WhatsApp/enviada pela IA) — deliberadamente distinto de "quando esta linha
 * foi persistida" (que fica só no model Prisma, não exposto aqui), mesmo
 * padrão já usado em `WhatsAppSessionEvent.occurredAt`.
 *
 * `contentType`/`media` (Fase 1, Bloco F1.1, ADR #90): antes desta extensão,
 * TODA mensagem era implicitamente texto — uma mensagem de imagem/áudio/
 * vídeo/documento/figurinha era descartada em silêncio por
 * `BaileysProvider.handleMessagesUpsert` antes mesmo de chegar aqui.
 * `contentType` default `'text'` preserva compatibilidade total com todo
 * código/dado existente; `media` só é definido quando `contentType !==
 * 'text'`.
 */
export interface Message {
  id: string;
  tenantId: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  contentType: MessageContentType;
  media?: MessageMediaReference;
  occurredAt: Date;
}
